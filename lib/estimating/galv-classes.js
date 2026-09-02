// Galvanizer rate classes: what the galvanizer actually prices on (AZZ
// Houston sheet, docs/galv-rate-sheet.pdf). A dipped assembly falls in one
// class by its MAIN member's shape (and, under 20 lb, by its dipped weight);
// attachments only add pounds to the parent's line. The class code is the
// identity of a galvanizing labor group, and the class rate seeds the line.
//
// Pure module. The live class list (rates editable on Global Pricing Data)
// is passed in; DEFAULT_GALV_CLASSES mirrors the sheet for reference/tests.

export const GALV_LIGHT_PIECE_LB = 20;

export const DEFAULT_GALV_CLASSES = [
  { code: 'KDS',   name: 'Knockdown Structural',           ratePerCwt: 27, sortOrder: 0, active: true },
  { code: 'GR2',   name: 'Grating - Fabricated',           ratePerCwt: 27, sortOrder: 1, active: true },
  { code: 'MSC',   name: 'Miscellaneous Fabricated Steel', ratePerCwt: 30, sortOrder: 2, active: true },
  { code: 'FPIP5', name: 'Fabricated Pipe < 14" dia',      ratePerCwt: 33, sortOrder: 3, active: true },
  { code: 'FTUB3', name: 'Fabricated Tube < 12"',          ratePerCwt: 33, sortOrder: 4, active: true },
  { code: 'FPIP2', name: 'Fabricated Pipe < 4" dia',       ratePerCwt: 37, sortOrder: 5, active: true },
  { code: 'FTUB2', name: 'Fabricated Tube < 8"',           ratePerCwt: 37, sortOrder: 6, active: true },
  { code: 'FPIP1', name: 'Fabricated Pipe < 3" dia',       ratePerCwt: 39, sortOrder: 7, active: true },
  { code: 'FTUB1', name: 'Fabricated Tube < 4"',           ratePerCwt: 39, sortOrder: 8, active: true },
  { code: 'MLT',   name: 'Material less than 20#',         ratePerCwt: 65, sortOrder: 9, active: true },
];

const STRUCTURAL_CATEGORIES = new Set(['W Shape', 'WT Shape', 'Channel', 'MC Channel', 'Angle']);
const HSS_CATEGORIES = new Set(['HSS Square', 'HSS Rect', 'HSS Round']);

// Leading numeric dimensions of a size string, e.g. "HSS 6x4x1/4" → [6, 4, 0.25],
// "PIPE 4 STD" → [4]. Fractions and decimals handled; letters stop the scan.
function leadingDims(size) {
  const s = String(size || '').toUpperCase().replace(/[××]/g, 'X');
  const body = s.replace(/^[A-Z]+\s*/, '');
  const out = [];
  for (const tok of body.split(/\s*X\s*|\s+/)) {
    if (!tok) continue;
    const m = tok.match(/^(\d+)(?:-(\d+)\/(\d+))?$|^(\d+)\/(\d+)$|^(\d*\.\d+)$/);
    if (!m) break;
    let v;
    if (m[1] != null) v = Number(m[1]) + (m[2] != null ? Number(m[2]) / Number(m[3]) : 0);
    else if (m[4] != null) v = Number(m[4]) / Number(m[5]);
    else v = Number(m[6]);
    out.push(v);
  }
  return out;
}

// Default class for a dipped assembly. `dippedWeightLb` is the whole
// assembly's weight (parent + galvanized attachments + connection weights).
export function defaultGalvClassCode(mat, dippedWeightLb) {
  const category = (mat?.category || '').trim();
  const size = mat?.size || mat?.shape || '';
  if (dippedWeightLb > 0 && dippedWeightLb < GALV_LIGHT_PIECE_LB) return 'MLT';

  if (category === 'Pipe') {
    const nominal = leadingDims(size)[0];
    if (!(nominal > 0)) return 'MSC';
    if (nominal < 3) return 'FPIP1';
    if (nominal < 4) return 'FPIP2';
    if (nominal < 14) return 'FPIP5';
    return 'MSC'; // over 14" is not on the sheet — quote it
  }
  if (HSS_CATEGORIES.has(category)) {
    const dims = leadingDims(size);
    // largest side; the wall is the last dim when three are present
    const sides = dims.length >= 3 ? dims.slice(0, -1) : dims.slice(0, 1);
    const largest = Math.max(0, ...sides);
    if (!(largest > 0)) return 'MSC';
    if (largest < 4) return 'FTUB1';
    if (largest < 8) return 'FTUB2';
    if (largest < 12) return 'FTUB3';
    return 'MSC';
  }
  if (STRUCTURAL_CATEGORIES.has(category)) return 'KDS';
  return 'MSC'; // plate, flats, round bar, custom, hardware
}

export function findGalvClass(classes, code) {
  if (!code) return null;
  return (classes || []).find(c => c.code === code) || null;
}

// $/lb for a class, or null when the class is unknown / classes not loaded.
export function galvClassRatePerLb(classes, code) {
  const cls = findGalvClass(classes, code);
  if (!cls) return null;
  return Math.round(((cls.ratePerCwt || 0) / 100) * 10000) / 10000;
}

export function galvClassLabel(classes, code) {
  const cls = findGalvClass(classes, code) || findGalvClass(DEFAULT_GALV_CLASSES, code);
  return cls ? cls.name : (code || 'Unclassified');
}
