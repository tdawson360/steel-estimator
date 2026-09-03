// Labor groups: grouped fab-op pricing within one item. Fab rows on parent
// members of the SAME EXACT SIZE sharing an operation are priced once as a
// single unit rate. (Until 2026-09-02 groups keyed on the shape family —
// "W12" for every W12 weight — but a cope on a C3x5 is not a cope on a
// C6x8.2, so identity is now the full size; the family key survives only
// for the "Sort by Shape Family" display order.) The group rate is stamped onto each member row's
// unitPrice; quantities stay per-row and line totals stay per-row
// (computeFabLineTotal), so every existing roll-up is unchanged. The group
// line's total is the SUM of member line totals — identical to count × rate
// for EA ops, and still correct for connection-LB and IN/LF ops where the
// per-row formula multiplies by connWeight or length.
//
// Pure module: no React, no Prisma, no Date.now(). Callers supply id
// generation (makeId) where new rows are created.

import { computeFabLineTotal } from './fab-costs';
import { galvClassRatePerLb } from './galv-classes';
import { HANDLING_OP, handlingRatePerPiece } from './handling';

export const GALV_OP = 'Galvanizing';
const isGalvGroup = (g) => g.operation === GALV_OP;
const isHandlingGroup = (g) => g.operation === HANDLING_OP;

export const GROUP_COLOR_COUNT = 5;

// ── Shape family ─────────────────────────────────────────────────────────────
// Family = shape type + leading dimensions, ignoring weight / wall / thickness:
//   W Shape   "W12x26"      → "W12"     (any weight)
//   WT Shape  "WT5x11"      → "WT5"
//   Channel   "C15x33.9"    → "C15"
//   MC        "MC18x42.7"   → "MC18"
//   Angle     "L3x3x1/4"    → "L 3x3"   (any thickness; fractional legs kept)
//   HSS       "HSS4x4x1/4"  → "HSS 4x4" (any wall; drop-last also covers round)
//   Pipe      "PIPE 4 STD"  → "PIPE 4"  (any schedule)
//   Round Bar "RD 3/4"      → "RD 3/4"  (diameter IS the identity)
// Plate, Flats, and Custom shapes never group (return null) — dropping
// thickness there would lump genuinely different pieces.
// Shared normalization: uppercase, unicode ×→X, then tighten dimension
// separators — only an X between dimension characters is a separator (so
// pipe schedules like "XS"/"XXS" survive), and it becomes lowercase 'x'.
function normalizeSizeText(size) {
  return size
    .trim()
    .toUpperCase()
    .replace(/[××]/g, 'X')
    .replace(/(?<=[\d/.\-])\s*X\s*(?=[\d/.])/g, 'x')
    .replace(/\s+/g, ' ');
}

function isUngroupableCategory(category) {
  const cat = (category || '').trim();
  return cat === 'Plate' || cat === 'Custom' || cat === 'Flats';
}

// ── Exact size key (GROUP IDENTITY) ──────────────────────────────────────────
// The full normalized size: "W12x26", "C3x5", "C6x8.2", "L3x3x1/4",
// "HSS4x4x1/4", "PIPE 4 STD". Two members group only when these are equal.
// Plate, Flats, and Custom never group (null), as before.
export function sizeKeyForSize(category, size) {
  if (isUngroupableCategory(category)) return null;
  if (!size || typeof size !== 'string') return null;
  const s = normalizeSizeText(size)
    // glue the shape prefix to an x-separated dimension token: "C 6x8.2" →
    // "C6x8.2", "L 3x3x1/4" → "L3x3x1/4"; spaced forms such as "PIPE 4 STD"
    // and "RD 3/4" keep their space.
    .replace(/^([A-Z]+)\s+(?=[\d/.][\d/.\-]*x)/, '$1');
  return s || null;
}

export function familyKeyForSize(category, size) {
  const cat = (category || '').trim();
  if (isUngroupableCategory(cat)) return null;
  if (!size || typeof size !== 'string') return null;

  const s = normalizeSizeText(size);
  if (!s) return null;

  const m = s.match(/^([A-Z]+)\s*(.*)$/);
  if (!m) return null;
  const prefix = m[1];
  const rest = m[2].trim();
  if (!rest) return null;

  if (cat === 'W Shape' || cat === 'WT Shape' || cat === 'Channel' || cat === 'MC Channel') {
    const depth = rest.split('x')[0].trim();
    return depth ? `${prefix}${depth}` : null;
  }
  if (cat === 'Angle') {
    const dims = rest.split('x').map(d => d.trim()).filter(Boolean);
    if (dims.length === 0) return null;
    const legs = dims.length >= 3 ? dims.slice(0, -1) : dims;
    return `${prefix} ${legs.join('x')}`;
  }
  if (cat === 'HSS Square' || cat === 'HSS Rect' || cat === 'HSS Round') {
    const dims = rest.split('x').map(d => d.trim()).filter(Boolean);
    if (dims.length === 0) return null;
    const kept = dims.length >= 2 ? dims.slice(0, -1) : dims;
    return `${prefix} ${kept.join('x')}`;
  }
  if (cat === 'Pipe') {
    const nominal = rest.split(' ')[0].trim();
    return nominal ? `${prefix} ${nominal}` : null;
  }
  if (cat === 'Round Bar') {
    return `${prefix} ${rest}`;
  }
  return null;
}

// Assembly galv lines (isAutoGalv) group by rate class; connection-galv rows
// never group. Filter by flags only — conn-galv rows carry string ids
// ("galv-<fabId>"), never key off id shape.
export function isGroupableFab(fab) {
  if (fab.isConnGalv) return false;
  if (fab.isAutoGalv || fab.isAutoHandling) return true;
  return !fab.isGalvLine;
}

export function fabOperationKey(fab) {
  return fab.operation === 'Custom' ? (fab.customOperation || 'Custom') : (fab.operation || '');
}

// Group identity for a fab row on a material: "size|operation", or null when
// the material can't group (plate/custom) or the row can't group.
// (Group objects keep the historical property name `familyKey` — it now
// holds this exact size key.)
export function fabGroupKey(material, fab) {
  if (!isGroupableFab(fab)) return null;
  // Galvanizing groups by the galvanizer's rate class, not the member size:
  // a W12 beam and an L3x3 kicker both dip as "Knockdown Structural".
  if (fab.isAutoGalv) return fab.galvClass ? `${fab.galvClass}|Galvanizing` : null;
  // Per-piece handling groups by weight class the same way.
  if (fab.isAutoHandling) return fab.handlingClass ? `${fab.handlingClass}|${HANDLING_OP}` : null;
  const sizeKey = sizeKeyForSize(material.category, material.size || material.shape);
  if (!sizeKey) return null;
  const op = fabOperationKey(fab);
  return op ? `${sizeKey}|${op}` : null;
}

// ── Exact-size split (load-time reconcile) ──────────────────────────────────
// Groups saved under the old family rule may span sizes (W12x26 + W12x14).
// Re-key every group to the exact size of its members: the first size (in
// materials order) keeps the group id; each further size gets its own group
// with the SAME rate/unit/collapsed state, so no line total moves. Groups
// whose familyKey is merely stale ("W12" for all-W12x26 members) are
// re-labelled in place. Identity-preserving when nothing changes.
export function splitGroupsBySize(item, { makeId } = {}) {
  const groups = item.laborGroups || [];
  if (groups.length === 0) return item;
  const materials = item.materials || [];
  const byId = new Map(groups.map(g => [g.id, g]));

  // groupId → ordered Map(sizeKey → fab ids)
  const membership = new Map();
  for (const mat of materials) {
    if (mat.parentMaterialId) continue;
    const sizeKey = sizeKeyForSize(mat.category, mat.size || mat.shape);
    for (const f of mat.fabrication || []) {
      if (f.laborGroupId == null || !isGroupableFab(f) || !byId.has(f.laborGroupId)) continue;
      let sizes = membership.get(f.laborGroupId);
      if (!sizes) { sizes = new Map(); membership.set(f.laborGroupId, sizes); }
      const key = (f.isAutoGalv ? f.galvClass : sizeKey) || '';
      if (!sizes.has(key)) sizes.set(key, []);
      sizes.get(key).push(f.id);
    }
  }

  let changed = false;
  const outGroups = [];
  const reassign = new Map(); // fab id → new group id
  const colorPool = [...groups];
  for (const g of groups) {
    const sizes = membership.get(g.id);
    if (!sizes || sizes.size === 0) { outGroups.push(g); continue; }
    const [first, ...rest] = [...sizes.entries()];
    const [firstKey] = first;
    if (firstKey && g.familyKey !== firstKey) {
      changed = true;
      outGroups.push({ ...g, familyKey: firstKey });
    } else {
      outGroups.push(g);
    }
    for (const [key, fabIds] of rest) {
      changed = true;
      const ng = {
        ...g,
        id: makeId ? makeId() : `${g.id}-${key}`,
        familyKey: key,
        colorIndex: nextColorIndex(colorPool),
        sortOrder: groups.length + outGroups.length,
      };
      colorPool.push(ng);
      outGroups.push(ng);
      for (const id of fabIds) reassign.set(id, ng.id);
    }
  }
  if (!changed) return item;

  const outMaterials = reassign.size === 0 ? materials : materials.map(mat => {
    let touched = false;
    const fabrication = (mat.fabrication || []).map(f => {
      const nid = reassign.get(f.id);
      if (nid === undefined) return f;
      touched = true;
      return { ...f, laborGroupId: nid };
    });
    return touched ? { ...mat, fabrication } : mat;
  });
  return { ...item, laborGroups: outGroups, materials: outMaterials };
}

// ── Rate application (the drift-critical step) ──────────────────────────────
// Stamp each grouped fab row's unitPrice/rate from its group. A pure map that
// NEVER filters or reorders — the server's index-aligned recompute and the
// positional totals-drift comparison both depend on array positions holding.
// Dangling laborGroupId (group deleted) leaves the row untouched. Child
// material fabs never carry laborGroupId, so they pass through unchanged.
export function applyGroupRates(item) {
  const groups = item.laborGroups || [];
  if (groups.length === 0) return item;
  const byId = new Map(groups.map(g => [g.id, g]));
  return {
    ...item,
    materials: (item.materials || []).map(mat => ({
      ...mat,
      fabrication: (mat.fabrication || []).map(f => {
        if (f.laborGroupId == null || !isGroupableFab(f)) return f;
        const g = byId.get(f.laborGroupId);
        if (!g) return f;
        return { ...f, unitPrice: g.rate || 0, rate: g.rate || 0 };
      }),
    })),
  };
}

// ── Group summaries (UI group lines and PDFs) ───────────────────────────────
// totalQty = Σ member quantities; totalCost = Σ member line totals computed
// at the group rate (NOT count × rate — see header).
export function computeGroupSummaries(item) {
  const groups = item.laborGroups || [];
  if (groups.length === 0) return [];
  const members = new Map(groups.map(g => [g.id, []]));
  for (const mat of item.materials || []) {
    for (const f of mat.fabrication || []) {
      if (f.laborGroupId != null && members.has(f.laborGroupId) && isGroupableFab(f)) {
        members.get(f.laborGroupId).push(f);
      }
    }
  }
  // Order: ordinary ops, then per-piece handling, then galvanizing last
  // (drill / cut lines above them); galv pounds round UP to a whole number.
  const rank = (g) => (isGalvGroup(g) ? 2 : isHandlingGroup(g) ? 1 : 0);
  const ordered = [...groups].sort((a, b) => rank(a) - rank(b));
  return ordered.map(g => {
    const fabs = members.get(g.id) || [];
    let totalQty = 0;
    let totalCost = 0;
    for (const f of fabs) {
      totalQty += f.quantity || 0;
      totalCost += computeFabLineTotal({ ...f, unitPrice: g.rate || 0 });
    }
    if (isGalvGroup(g)) totalQty = Math.ceil(totalQty - 1e-9);
    return {
      id: g.id,
      operation: g.operation,
      familyKey: g.familyKey,
      unit: g.unit || 'ea',
      rate: g.rate || 0,
      collapsed: !!g.collapsed,
      colorIndex: g.colorIndex || 0,
      sortOrder: g.sortOrder || 0,
      totalQty,
      totalCost,
      memberFabIds: fabs.map(f => f.id),
      memberCount: fabs.length,
    };
  });
}

// ── Size blocks (render placement) ──────────────────────────────────────────
// Ordered { familyKey, parentIds } — familyKey holds the exact size key —
// derived from the materials array's current order (first-appearance order).
// Child materials (parentMaterialId set) ride with their parent and never
// open a block.
export function familyBlocks(materials) {
  const blocks = [];
  const byKey = new Map();
  for (const mat of materials || []) {
    if (mat.parentMaterialId) continue;
    const key = sizeKeyForSize(mat.category, mat.size || mat.shape);
    let block = byKey.get(key);
    if (!block) {
      block = { familyKey: key, parentIds: [] };
      byKey.set(key, block);
      blocks.push(block);
    }
    block.parentIds.push(mat.id);
  }
  return blocks;
}

// The last parent id (in array order) whose exact size matches each group's
// familyKey (size key) — where that group's summary line renders. Robust to
// manual drags that interleave sizes.
export function groupAnchors(materials, groups) {
  const anchors = new Map(); // groupId → parent material id (or null)
  const parents = (materials || []).filter(m => !m.parentMaterialId);
  const lastParentId = parents.length ? parents[parents.length - 1].id : null;
  for (const g of groups || []) {
    let anchor = null;
    // Galvanizing groups sit at the bottom of the item, after every member.
    if (isGalvGroup(g)) { anchors.set(g.id, lastParentId); continue; }
    // Members place the line; a group with no members yet falls back to the
    // last parent of its size.
    for (const mat of materials || []) {
      if (mat.parentMaterialId) continue;
      if ((mat.fabrication || []).some(f => f.laborGroupId === g.id)) anchor = mat.id;
    }
    if (anchor != null) { anchors.set(g.id, anchor); continue; }
    for (const mat of materials || []) {
      if (mat.parentMaterialId) continue;
      if (sizeKeyForSize(mat.category, mat.size || mat.shape) === g.familyKey) {
        anchor = mat.id;
      }
    }
    anchors.set(g.id, anchor);
  }
  return anchors;
}

// Auto-join: an ungrouped assembly galv line whose class already has a
// "Galvanizing" group in this item joins it and takes the group rate (the
// same courtesy addMaterialFab extends to ordinary ops). Children (a
// galvanized attachment dipping alone) stay individual. Identity-preserving.
export function joinGalvGroups(item) {
  const groups = item.laborGroups || [];
  if (groups.length === 0) return item;
  const byClass = new Map(groups.filter(g => g.operation === 'Galvanizing').map(g => [g.familyKey, g]));
  if (byClass.size === 0) return item;
  let changed = false;
  const materials = (item.materials || []).map(mat => {
    if (mat.parentMaterialId) return mat;
    let touched = false;
    const fabrication = (mat.fabrication || []).map(f => {
      if (!f.isAutoGalv || f.laborGroupId != null || !f.galvClass) return f;
      const g = byClass.get(f.galvClass);
      if (!g) return f;
      touched = true;
      const next = { ...f, laborGroupId: g.id, unitPrice: g.rate || 0, rate: g.rate || 0 };
      return { ...next, totalCost: computeFabLineTotal(next) };
    });
    if (touched) changed = true;
    return touched ? { ...mat, fabrication } : mat;
  });
  return changed ? { ...item, materials } : item;
}

// A galv group still at $0 takes its class rate from the class table (the
// "default rate in the admin panel" reaching the estimate). Members are
// stamped by applyGroupRates; call that after. Identity-preserving.
export function seedGalvGroupRates(item, galvClasses) {
  const groups = item.laborGroups || [];
  if (!groups.length || !galvClasses) return item;
  let changed = false;
  const laborGroups = groups.map(g => {
    if (!isGalvGroup(g) || g.rate) return g;
    const rate = galvClassRatePerLb(galvClasses, g.familyKey);
    if (!rate) return g;
    changed = true;
    return { ...g, rate };
  });
  return changed ? { ...item, laborGroups } : item;
}

// Auto-join for per-piece handling lines: an ungrouped handling line whose
// class already has a "Piece Handling" group in this item joins it and takes
// the group rate. Identity-preserving.
export function joinHandlingGroups(item) {
  const groups = item.laborGroups || [];
  if (groups.length === 0) return item;
  const byClass = new Map(groups.filter(isHandlingGroup).map(g => [g.familyKey, g]));
  if (byClass.size === 0) return item;
  let changed = false;
  const materials = (item.materials || []).map(mat => {
    if (mat.parentMaterialId) return mat;
    let touched = false;
    const fabrication = (mat.fabrication || []).map(f => {
      if (!f.isAutoHandling || f.laborGroupId != null || !f.handlingClass) return f;
      const g = byClass.get(f.handlingClass);
      if (!g) return f;
      touched = true;
      const next = { ...f, laborGroupId: g.id, unitPrice: g.rate || 0, rate: g.rate || 0 };
      return { ...next, totalCost: computeFabLineTotal(next) };
    });
    if (touched) changed = true;
    return touched ? { ...mat, fabrication } : mat;
  });
  return changed ? { ...item, materials } : item;
}

// A handling group still at $0 takes its class rate (minutes × shop rate).
// Members are stamped by applyGroupRates; call that after. Identity-preserving.
export function seedHandlingGroupRates(item, handlingClasses, shopRate) {
  const groups = item.laborGroups || [];
  if (!groups.length || !handlingClasses) return item;
  let changed = false;
  const laborGroups = groups.map(g => {
    if (!isHandlingGroup(g) || g.rate) return g;
    const rate = handlingRatePerPiece(handlingClasses, g.familyKey, shopRate);
    if (!rate) return g;
    changed = true;
    return { ...g, rate };
  });
  return changed ? { ...item, laborGroups } : item;
}

// Next palette slot: smallest unused index, cycling once all are in use.
export function nextColorIndex(existingGroups) {
  const used = new Set((existingGroups || []).map(g => g.colorIndex || 0));
  for (let i = 0; i < GROUP_COLOR_COUNT; i++) {
    if (!used.has(i)) return i;
  }
  return (existingGroups || []).length % GROUP_COLOR_COUNT;
}

// ── Auto-grouping (import and "Group similar") ──────────────────────────────
// Walk parent materials' ungrouped groupable fabs, keyed by family|operation:
//   - a key matching an existing group joins that group (adopting its rate)
//   - otherwise, keys with ≥ minMembers rows form a new group
// New-group rate: if every member row carries the same unitPrice (±$0.005)
// that rate is kept; mixed rates start at 0 (the UI flags rate 0 as
// "needs pricing"). Returns { groups: [new group objects], assignments:
// Map(fabId → groupId) } — the caller stamps assignments and rates.
export function buildAutoGroups(materials, existingGroups, { minMembers = 2, makeId, galvClasses = null } = {}) {
  const existing = existingGroups || [];
  const existingByKey = new Map(existing.map(g => [`${g.familyKey}|${g.operation}`, g]));
  const assignments = new Map();
  const buckets = new Map(); // key → { familyKey, operation, unit, fabs: [] }

  for (const mat of materials || []) {
    if (mat.parentMaterialId) continue;
    for (const f of mat.fabrication || []) {
      if (f.laborGroupId != null) continue;
      const key = fabGroupKey(mat, f);
      if (!key) continue;
      const eg = existingByKey.get(key);
      if (eg) {
        assignments.set(f.id, eg.id);
        continue;
      }
      let bucket = buckets.get(key);
      if (!bucket) {
        const [familyKey, operation] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
        bucket = { familyKey, operation, unit: f.unit || 'ea', fabs: [] };
        buckets.set(key, bucket);
      }
      bucket.fabs.push(f);
    }
  }

  const groups = [];
  const colorPool = [...existing];
  for (const bucket of buckets.values()) {
    if (bucket.fabs.length < minMembers) continue;
    const rates = bucket.fabs.map(f => f.unitPrice || 0);
    const uniform = rates.every(r => Math.abs(r - rates[0]) <= 0.005);
    let rate = uniform ? rates[0] : 0;
    // An unpriced galv group takes the class rate from Global Pricing Data
    if (!rate && bucket.operation === GALV_OP) rate = galvClassRatePerLb(galvClasses, bucket.familyKey) || 0;
    const group = {
      id: makeId ? makeId() : null,
      operation: bucket.operation,
      familyKey: bucket.familyKey,
      unit: bucket.unit,
      rate,
      // Groups start collapsed: the estimate reads as one summary line per
      // group, and a member's hidden ops surface as an "N grouped" tag.
      collapsed: true,
      colorIndex: nextColorIndex(colorPool),
    };
    colorPool.push(group);
    groups.push(group);
    for (const f of bucket.fabs) assignments.set(f.id, group.id);
  }

  return { groups, assignments };
}

// ── Family sort ─────────────────────────────────────────────────────────────
// Parents ordered family (numeric-aware, null families last) → size → longest
// length first; children stay glued behind their parent in original relative
// order. Caller re-runs resequenceMaterials for sequence letters.
export function sortMaterialsByFamily(materials) {
  const list = materials || [];
  const parents = list.filter(m => !m.parentMaterialId);
  const cmp = (a, b) => {
    const fa = familyKeyForSize(a.category, a.size || a.shape);
    const fb = familyKeyForSize(b.category, b.size || b.shape);
    if (fa === null && fb !== null) return 1;
    if (fa !== null && fb === null) return -1;
    if (fa !== fb) return String(fa).localeCompare(String(fb), undefined, { numeric: true });
    const sa = a.size || a.shape || '';
    const sb = b.size || b.shape || '';
    if (sa !== sb) return sa.localeCompare(sb, undefined, { numeric: true });
    return (b.length || 0) - (a.length || 0);
  };
  const sortedParents = [...parents].sort(cmp);
  const out = [];
  for (const parent of sortedParents) {
    out.push(parent);
    for (const m of list) {
      if (m.parentMaterialId === parent.id) out.push(m);
    }
  }
  // Orphaned children (shouldn't happen) tail the list rather than vanish
  for (const m of list) {
    if (m.parentMaterialId && !out.includes(m)) out.push(m);
  }
  return out;
}
