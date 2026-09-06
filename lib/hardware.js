// Hardware catalog helpers — shared by the admin editor, the /api/hardware
// route, the seed script and (phase 2) the estimator's Hardware picker.
// Pure: no Prisma, no React.

export const HARDWARE_KINDS = {
  BOLT_SET: 'Bolt set',
  EXPANSION_ANCHOR: 'Expansion anchor',
  ADHESIVE_ANCHOR: 'Adhesive anchor rod',
  ADHESIVE: 'Adhesive',
  // Cast-in anchor rods (F1554 Gr36 / Gr50): outsourced, priced per each with
  // nuts and washers; HDG variants are bought pre-galvanized and, like all
  // hardware, never add weight to a galv dip (Todd, 2026-09-05).
  ANCHOR_ROD: 'Anchor rod (cast-in)',
};

export const HARDWARE_FINISHES = ['Plain', 'Zinc', 'HDG', 'SS'];

// Berger buys 11.1 fl oz (330 ml) foil packs for all epoxy work.
export const DEFAULT_CARTRIDGE_ML = 330;

// "2-1/2" → 2.5, "3/4" → 0.75, "2" → 2, "330 ml" → 330, "" → 0
export function parseInches(s) {
  if (s == null) return 0;
  const str = String(s).trim().replace(/["″]/g, '');
  if (!str) return 0;
  const m = str.match(/^(\d+)?\s*[- ]?\s*(\d+)\/(\d+)$/);
  if (m) {
    const whole = m[1] ? parseInt(m[1], 10) : 0;
    const den = parseInt(m[3], 10);
    return den ? whole + parseInt(m[2], 10) / den : whole;
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : 0;
}

// 2.5 → "2-1/2", 0.75 → "3/4", 6 → "6" (nearest 1/16)
export function formatInches(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  const sixteenths = Math.round(n * 16);
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16;
  if (num === 0) return String(whole);
  let den = 16;
  while (num % 2 === 0) { num /= 2; den /= 2; }
  return whole ? `${whole}-${num}/${den}` : `${num}/${den}`;
}

// Display label the estimator writes into the row's Size / description:
//   3/4" A325 x 2"   ·   1/2" Kwik Bolt x 5-1/2"   ·   1/2" HAS-V-36 x 6"
//   HIT-HY 200 V3 330 ml
// A finish is appended only when it says something the family name doesn't
// (Plain and Zinc are the ordinary case; "HAS-B-105 HDG" already says HDG).
export function hardwareLabel(item) {
  if (!item) return '';
  if (item.kind === 'ADHESIVE') return `${item.name || item.family} ${item.length}`.trim();
  const base = `${item.diameter}" ${item.name || item.family} x ${item.length}"`;
  const f = item.finish || 'Plain';
  const finishShown = f !== 'Plain' && f !== 'Zinc' && !String(item.family).toUpperCase().includes(f.toUpperCase());
  return finishShown ? `${base} ${f}` : base;
}

const FINISH_ORDER = { Plain: 0, Zinc: 1, HDG: 2, SS: 3 };

// Catalog order: family sortOrder, then family name, diameter, length, finish.
export function compareHardware(a, b) {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    || String(a.family).localeCompare(String(b.family))
    || String(a.name || '').localeCompare(String(b.name || ''))
    || (a.diameterIn ?? 0) - (b.diameterIn ?? 0)
    || (a.lengthIn ?? 0) - (b.lengthIn ?? 0)
    || (FINISH_ORDER[a.finish] ?? 9) - (FINISH_ORDER[b.finish] ?? 9);
}

// [{ family, kind, items: [...] }] in catalog order, preserving item order.
export function groupByFamily(items) {
  const sorted = [...(items || [])].sort(compareHardware);
  const out = [];
  const byFamily = new Map();
  for (const it of sorted) {
    let g = byFamily.get(it.family);
    if (!g) {
      g = { family: it.family, kind: it.kind, items: [] };
      byFamily.set(it.family, g);
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}

// The same size in another finish: galvanized (HDG) when `galvanized`, else
// the plain/zinc one. Hardware is bought already galvanized, so the row's
// Galv flag means "use the HDG catalog price" — never a trip to the kettle.
// Returns null when the catalog has no such variant (or it is unpriced), in
// which case the row keeps its current item and price.
export function hardwareFinishVariant(items, item, galvanized) {
  if (!item) return null;
  const wantHdg = !!galvanized;
  const candidates = (items || []).filter(i =>
    i.active !== false && i.id !== item.id
    && i.family === item.family && (i.name || '') === (item.name || '')
    && i.diameter === item.diameter && i.length === item.length
    && (wantHdg ? i.finish === 'HDG' : (i.finish === 'Plain' || i.finish === 'Zinc'))
    && (i.unitPrice || 0) > 0);
  if (wantHdg && item.finish === 'HDG') return null;
  if (!wantHdg && item.finish !== 'HDG') return null;
  return candidates.sort(compareHardware)[0] || null;
}

// The preselected item for a family: the flagged default, else the first
// active item in catalog order.
export function defaultForFamily(items, family) {
  const fam = (items || []).filter(i => i.family === family && i.active !== false).sort(compareHardware);
  return fam.find(i => i.isDefault) || fam[0] || null;
}
