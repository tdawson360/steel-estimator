// Per-piece handling — unloading, racking, moving to the saw and fit-up —
// one automatic "Piece Handling" line per main member, priced by weight
// class (Global Pricing Data → Handling). Samantha's rule (2026-09-03):
// this cost is not captured by any fab op, and it varies with the piece.
//
//   - Class = the weight bracket of ONE piece: the member's own weight per
//     piece plus its attachments (they move as one piece once fitted).
//     Attachments carry no line of their own; Hardware never gets one.
//   - Rate  = class minutes per piece × shop labor rate ($/hr ÷ 60), so
//     handling follows the shop rate. A line at $0 takes the class rate; a
//     priced line keeps whatever the estimator set (same rule as galv).
//   - Class is re-derived from weight until the estimator pins it (picks a
//     class on the line); the group picker pins every member.
//   - Per project switch (Project.handlingEnabled): off → no lines at all.
//     A member can be excluded (handlingExcluded) → no line for that member.
//
// Pure module used by the estimator UI and mirrored by the recompute engine
// (which re-derives the quantity = pieces and prices at the group/line rate).

export const HANDLING_OP = 'Piece Handling';

// Live config for the estimator's many normalize call sites (the wrapper in
// SteelEstimator runs handling after galv on every mutation). The engine
// never depends on it.
let configured = { enabled: false, classes: null, shopRate: 0 };
export function configureHandling({ enabled, classes, shopRate } = {}) {
  configured = {
    enabled: !!enabled,
    classes: Array.isArray(classes) ? classes : configured.classes,
    shopRate: Number.isFinite(Number(shopRate)) ? Number(shopRate) : configured.shopRate,
  };
}
export function getConfiguredHandling() {
  return configured;
}

// Seeded brackets (mirrors the migration seed). Minutes start at 0 —
// Samantha supplies them on Global Pricing Data.
export const DEFAULT_HANDLING_CLASSES = [
  { code: 'HL1', name: 'Light (under 50 lb)',          minLb: 0,    maxLb: 50,   minutesPerPiece: 0, sortOrder: 1, active: true },
  { code: 'HL2', name: 'Medium (50–250 lb)',           minLb: 50,   maxLb: 250,  minutesPerPiece: 0, sortOrder: 2, active: true },
  { code: 'HL3', name: 'Heavy (250–1,000 lb)',         minLb: 250,  maxLb: 1000, minutesPerPiece: 0, sortOrder: 3, active: true },
  { code: 'HL4', name: 'Very heavy (1,000–3,000 lb)',  minLb: 1000, maxLb: 3000, minutesPerPiece: 0, sortOrder: 4, active: true },
  { code: 'HL5', name: 'Crane (over 3,000 lb)',        minLb: 3000, maxLb: null, minutesPerPiece: 0, sortOrder: 5, active: true },
];

export function findHandlingClass(classes, code) {
  return (classes || DEFAULT_HANDLING_CLASSES).find(c => c.code === code) || null;
}

export function handlingClassLabel(classes, code) {
  return findHandlingClass(classes, code)?.name || code || '';
}

// $/piece for a class: minutes ÷ 60 × shop rate. 0 when unpriced.
export function handlingRatePerPiece(classes, code, shopRate) {
  const c = findHandlingClass(classes, code);
  const minutes = Number(c?.minutesPerPiece) || 0;
  const rate = Number(shopRate) || 0;
  if (!minutes || !rate) return 0;
  return Math.round((minutes / 60) * rate * 100) / 100;
}

// Weight of ONE piece of a main member, attachments included: the member's
// fabWeight ÷ pieces, plus each attachment's fabWeight ÷ the member's pieces.
export function pieceHandlingWeight(mat, materials) {
  const pieces = mat.pieces || 0;
  if (!pieces) return 0;
  let total = mat.fabWeight || 0;
  for (const m of materials || []) {
    if (m.parentMaterialId === mat.id) total += m.fabWeight || 0;
  }
  return total / pieces;
}

// Bracket for a piece weight: first active class whose [minLb, maxLb) holds
// it, in sortOrder; a weight past every bracket takes the last class.
export function defaultHandlingClassCode(weightLb, classes) {
  const list = (classes || DEFAULT_HANDLING_CLASSES).filter(c => c.active !== false)
    .slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.minLb ?? 0) - (b.minLb ?? 0));
  if (!list.length) return null;
  const w = Number(weightLb) || 0;
  for (const c of list) {
    const lo = Number(c.minLb) || 0;
    const hi = c.maxLb == null || c.maxLb === '' ? Infinity : Number(c.maxLb);
    if (w >= lo && w < hi) return c.code;
  }
  return list[list.length - 1].code;
}

export function handlesAsPiece(mat) {
  return !!mat && !mat.parentMaterialId && mat.category !== 'Hardware' && !mat.handlingExcluded;
}

// Reconcile every auto handling line in a flat materials array: add missing
// lines (when enabled), drop lines that no longer belong, resync quantity /
// class / description. Identity-preserving: fabrication arrays are only
// replaced when something changed.
export function normalizeHandlingLines(materials, opts = {}) {
  const enabled = opts.enabled ?? configured.enabled;
  const classes = opts.classes ?? configured.classes ?? DEFAULT_HANDLING_CLASSES;
  const shopRate = opts.shopRate ?? configured.shopRate ?? 0;
  const list = materials || [];
  let anyChanged = false;
  const result = list.map(mat => {
    const fabs = mat.fabrication || [];
    const owns = enabled && handlesAsPiece(mat);
    const out = [];
    let changed = false;
    let saw = false;
    const pieces = mat.pieces || 0;
    const weightEach = pieceHandlingWeight(mat, list);

    for (const f of fabs) {
      if (!f.isAutoHandling) { out.push(f); continue; }
      if (!owns) { changed = true; continue; }
      saw = true;
      const handlingClass = f.handlingClassPinned && f.handlingClass
        ? f.handlingClass
        : (defaultHandlingClassCode(weightEach, classes) || f.handlingClass || null);
      const description = `Handling — ${handlingClassLabel(classes, handlingClass)}`;
      const seeded = !f.unitPrice ? handlingRatePerPiece(classes, handlingClass, shopRate) : 0;
      const unitPrice = seeded || (f.unitPrice || 0);
      if ((f.quantity || 0) !== pieces || f.handlingClass !== handlingClass || f.description !== description
          || unitPrice !== (f.unitPrice || 0) || Math.abs((f.totalCost || 0) - pieces * unitPrice) > 0.005) {
        changed = true;
        out.push({ ...f, quantity: pieces, handlingClass, description, unitPrice, rate: unitPrice, totalCost: pieces * unitPrice });
      } else {
        out.push(f);
      }
    }

    if (owns && !saw) {
      changed = true;
      const handlingClass = defaultHandlingClassCode(weightEach, classes);
      const unitPrice = handlingRatePerPiece(classes, handlingClass, shopRate);
      out.push({
        id: `autohandling-${mat.id}`,
        operation: HANDLING_OP,
        description: `Handling — ${handlingClassLabel(classes, handlingClass)}`,
        quantity: pieces,
        unit: 'EA',
        unitPrice,
        rate: unitPrice,
        totalCost: pieces * unitPrice,
        multiplyByPieces: false,
        isAutoHandling: true,
        handlingClass,
        handlingClassPinned: false,
      });
    }

    if (!changed) return mat;
    anyChanged = true;
    return { ...mat, fabrication: out };
  });
  return anyChanged ? result : list;   // identity-preserving when nothing moved
}

// Project-wide handling spend (every auto handling line).
export function projectHandlingTotal(items) {
  let total = 0;
  for (const item of items || []) {
    for (const mat of item.materials || []) {
      for (const f of mat.fabrication || []) {
        if (f.isAutoHandling) total += f.totalCost || 0;
      }
    }
  }
  return total;
}
