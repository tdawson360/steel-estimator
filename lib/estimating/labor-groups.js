// Labor groups: grouped fab-op pricing within one item. Fab rows on parent
// members of the same shape family sharing an operation are priced once as a
// single unit rate. The group rate is stamped onto each member row's
// unitPrice; quantities stay per-row and line totals stay per-row
// (computeFabLineTotal), so every existing roll-up is unchanged. The group
// line's total is the SUM of member line totals — identical to count × rate
// for EA ops, and still correct for connection-LB and IN/LF ops where the
// per-row formula multiplies by connWeight or length.
//
// Pure module: no React, no Prisma, no Date.now(). Callers supply id
// generation (makeId) where new rows are created.

import { computeFabLineTotal } from './fab-costs';

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
export function familyKeyForSize(category, size) {
  const cat = (category || '').trim();
  if (cat === 'Plate' || cat === 'Custom' || cat === 'Flats') return null;
  if (!size || typeof size !== 'string') return null;

  // Normalize: uppercase, unicode ×→X, then tighten dimension separators —
  // only an X between dimension characters is a separator (so pipe schedules
  // like "XS"/"XXS" survive), and it becomes lowercase 'x'.
  const s = size
    .trim()
    .toUpperCase()
    .replace(/[××]/g, 'X')
    .replace(/(?<=[\d/.\-])\s*X\s*(?=[\d/.])/g, 'x')
    .replace(/\s+/g, ' ');
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

// Galv rows (auto or connection) never group. Filter by flags only — conn-galv
// rows carry string ids ("galv-<fabId>"), never key off id shape.
export function isGroupableFab(fab) {
  return !fab.isAutoGalv && !fab.isConnGalv && !fab.isGalvLine;
}

export function fabOperationKey(fab) {
  return fab.operation === 'Custom' ? (fab.customOperation || 'Custom') : (fab.operation || '');
}

// Group identity for a fab row on a material: "family|operation", or null when
// the material's shape has no family (plate/custom) or the row can't group.
export function fabGroupKey(material, fab) {
  if (!isGroupableFab(fab)) return null;
  const family = familyKeyForSize(material.category, material.size || material.shape);
  if (!family) return null;
  const op = fabOperationKey(fab);
  return op ? `${family}|${op}` : null;
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
  return groups.map(g => {
    const fabs = members.get(g.id) || [];
    let totalQty = 0;
    let totalCost = 0;
    for (const f of fabs) {
      totalQty += f.quantity || 0;
      totalCost += computeFabLineTotal({ ...f, unitPrice: g.rate || 0 });
    }
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

// ── Family blocks (render placement) ────────────────────────────────────────
// Ordered { familyKey, parentIds } derived from the materials array's current
// order (first-appearance order). Child materials (parentMaterialId set) ride
// with their parent and never open a block.
export function familyBlocks(materials) {
  const blocks = [];
  const byKey = new Map();
  for (const mat of materials || []) {
    if (mat.parentMaterialId) continue;
    const key = familyKeyForSize(mat.category, mat.size || mat.shape);
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

// The last parent id (in array order) whose family matches each group's
// familyKey — where that group's summary line renders. Robust to manual drags
// that interleave families.
export function groupAnchors(materials, groups) {
  const anchors = new Map(); // groupId → parent material id (or null)
  for (const g of groups || []) {
    let anchor = null;
    for (const mat of materials || []) {
      if (mat.parentMaterialId) continue;
      if (familyKeyForSize(mat.category, mat.size || mat.shape) === g.familyKey) {
        anchor = mat.id;
      }
    }
    anchors.set(g.id, anchor);
  }
  return anchors;
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
export function buildAutoGroups(materials, existingGroups, { minMembers = 2, makeId } = {}) {
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
    const group = {
      id: makeId ? makeId() : null,
      operation: bucket.operation,
      familyKey: bucket.familyKey,
      unit: bucket.unit,
      rate: uniform ? rates[0] : 0,
      collapsed: false,
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
