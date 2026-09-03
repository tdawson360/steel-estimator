// DB row → engine/client input mapping, shared by the client loader
// (SteelEstimator.jsx handleLoad) and the server loader
// (lib/recompute-server.js dbProjectToEngineTree). Pure; no React/Prisma.
//
// Two classes of calculator input do not live under their own names in the
// DB. Before this module neither loader supplied them, so a reloaded plate or
// Custom line recalculated to 0 lb / $0, and a connection-galv line came back
// as an assembly line, was dropped by normalizeGalvLines, and was recreated
// at a $0 rate:
//   - plate dims:    DB thickness/width          → plateThickness/plateWidth
//   - typed weight:  DB weightPerFt (Custom/HW)   → customWeight
//   - galv identity: DB galvKind + parentFabId    → isAutoGalv | isConnGalv
//     (legacy rows: isGalvLine=true, galvKind=null — inferred from the owner)

import { plateThicknesses } from './plates';

const CUSTOM_WEIGHT_CATEGORIES = new Set(['Custom', 'Hardware']);

// The calculator's own plate size string, e.g. `PL 1/2" × 6"` → dims.
// Recovers plates saved before thickness/width were written on edit.
export function parsePlateSize(size) {
  const m = /^PL\s+(.+?)\s*×\s*([\d.]+)"?\s*$/.exec(size || '');
  if (!m) return null;
  const label = m[1].trim();
  const known = plateThicknesses.find(p => p.label === label);
  const thickness = known ? known.value : parseFloat(label);
  const width = parseFloat(m[2]);
  if (!(thickness > 0) || !(width > 0)) return null;
  return { thickness, width };
}

export function materialCalcInputsFromDb(mat) {
  const category = mat.category || '';
  if (category === 'Plate') {
    // The size string is the calculator's own output from the last client
    // state, so it wins over the columns: rows saved before 587a85c carry
    // stale importer-era thickness/width (UI edits never reached them).
    const parsed = parsePlateSize(mat.shape) || parsePlateSize(mat.description);
    const thickness = parsed?.thickness ?? mat.thickness ?? null;
    const width = parsed?.width ?? mat.width ?? null;
    return { plateThickness: thickness || null, plateWidth: width || null, customWeight: null };
  }
  if (CUSTOM_WEIGHT_CATEGORIES.has(category)) {
    return { plateThickness: null, plateWidth: null, customWeight: mat.weightPerFt || 0 };
  }
  return { plateThickness: null, plateWidth: null, customWeight: null };
}

// Extra fields for a per-piece handling line loaded from the DB.
export function handlingLineFieldsFromDb(f) {
  if (f.handlingKind !== 'auto') return {};
  return {
    isAutoHandling: true,
    handlingClass: f.handlingClass ?? null,
    handlingClassPinned: !!f.handlingPinned,
    multiplyByPieces: false,
  };
}

function isLegacyGalvLine(f) {
  return !!f.isGalvLine && !f.galvKind;
}

// Extra fields for a galv line loaded from the DB. `siblings` is the owning
// material's full fab list (same row objects), used to find the parent op.
export function galvLineFieldsFromDb(f, mat, siblings) {
  const kind = f.galvKind || (f.isGalvLine ? (mat.galvanized ? 'auto' : 'conn') : null);
  if (!kind) return {};

  if (kind === 'auto') {
    return {
      isAutoGalv: true,
      description: `Galv - ${mat.description || mat.shape || ''}`,
      multiplyByPieces: false,
      galvClass: f.galvClass ?? null,
    };
  }

  let parentFabId = f.parentFabId ?? null;
  if (parentFabId == null && isLegacyGalvLine(f)) {
    // Legacy conn line (saved before parentFabId existed): pair the k-th such
    // line with the k-th galvanized connection op of the same galv weight —
    // lines were created in op order, so this reproduces the original link.
    const isConnOp = s => !s.isGalvLine && !s.galvKind && s.galvanized && s.galvWeight > 0;
    const candidates = siblings.filter(s => isConnOp(s) && s.galvWeight === f.quantity);
    const k = siblings.filter(s => isLegacyGalvLine(s) && s.quantity === f.quantity).indexOf(f);
    parentFabId = candidates[k]?.id ?? null;
  }
  const parent = siblings.find(s => s.id === parentFabId);
  return {
    isConnGalv: true,
    parentFabId,
    description: `Galv - ${parent ? parent.operation : 'connection'}`,
  };
}
