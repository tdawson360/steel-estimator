// Cross-item stock nesting engine: capacitated first-fit-decreasing packing,
// per-group yield allocation, over-length/shortfall flags, cut-ticket
// compression, and the live-nesting piece cap.

import { getStockLengthsForCategory } from './stock-lengths';

// ── CROSS-ITEM STOCK NESTING ──────────────────────────────────────────────────
// Pools cut lengths from every non-standalone item by size and nests them onto
// shared sticks (first-fit-decreasing), so one item's drop absorbs another
// item's short piece. Purchased cost flows back to each material line pro-rata
// via a per-group yield factor (purchased length ÷ net cut length), so items
// keep individual prices and still sum exactly to the buy list.
//
// Plate is 2D sheet stock and Custom lines have no reliable size key — both
// keep the per-line stock logic and never pool.
const NEST_EXCLUDED_CATEGORIES = new Set(['Plate', 'Custom']);

const isNestableMaterial = (mat) =>
  !!mat.size &&
  !NEST_EXCLUDED_CATEGORIES.has(mat.category) &&
  (mat.pieces || 0) > 0 &&
  (mat.length || 0) > 0 &&
  (mat.weightPerFoot || 0) > 0;

// First-fit-decreasing with per-length supply caps (capacitated cutting stock).
// Packs cuts onto sticks of the longest length that still has supply, assigns
// each stick the shortest in-supply length that covers it, and re-nests
// whatever couldn't be placed against the remaining supply. A stick with n
// cuts consumes n−1 kerfs (the last piece needs no trailing cut); endCropFt is
// reserved once per stick.
// Returns { sticks, overLength, shortfall }:
//   overLength — cuts longer than the longest catalog length (splice / mill order)
//   shortfall  — cuts that fit the catalog but exceed the supplier's stick counts
const nestCutsFFD = (cuts, stockLengths, kerfFt, endCropFt, caps = {}) => {
  const catalogMaxUsable = Math.max(...stockLengths) - endCropFt;
  const remainingCap = new Map(stockLengths.map(l => {
    const c = caps[l];
    return [l, (typeof c === 'number' && c > 0) ? c : Infinity];
  }));

  const sticksOut = [];
  const overLength = [];
  const shortfall = [];
  let pending = [...cuts].sort((a, b) => b.length - a.length);

  while (pending.length > 0) {
    const usable = stockLengths.filter(l => remainingCap.get(l) > 0);
    if (usable.length === 0) {
      shortfall.push(...pending);
      break;
    }
    const maxStock = Math.max(...usable);
    const maxUsable = maxStock - endCropFt;

    const fitting = [];
    for (const cut of pending) {
      if (cut.length > maxUsable) {
        (cut.length > catalogMaxUsable ? overLength : shortfall).push(cut);
      } else {
        fitting.push(cut);
      }
    }
    if (fitting.length === 0) break;

    // FFD pack onto virtual sticks of the longest in-supply length.
    // Cuts place in runs of equal length with batch math, so cost is
    // O(runs × sticks) instead of O(cuts × sticks) — a huge piece count
    // (or a quantity typo mid-keystroke) can no longer lock the UI thread.
    const sticks = [];
    let ri = 0;
    while (ri < fitting.length) {
      let rj = ri;
      while (rj < fitting.length && fitting[rj].length === fitting[ri].length) rj++;
      const L = fitting[ri].length;
      const per = L + kerfFt; // joining an occupied stick adds one kerf
      let qi = ri;
      for (const stick of sticks) {
        if (qi >= rj) break;
        if (stick.remaining + 1e-9 >= per) {
          const k = Math.min(rj - qi, Math.floor((stick.remaining + 1e-9) / per));
          for (let c = 0; c < k; c++) stick.cuts.push(fitting[qi++]);
          stick.remaining -= k * per;
          stick.used += k * per;
        }
      }
      while (qi < rj) {
        const stick = { cuts: [fitting[qi++]], used: L, remaining: maxUsable - L };
        const k = Math.min(rj - qi, Math.floor((stick.remaining + 1e-9) / per));
        for (let c = 0; c < k; c++) stick.cuts.push(fitting[qi++]);
        stick.remaining -= k * per;
        stick.used += k * per;
        sticks.push(stick);
      }
      ri = rj;
    }

    // Fullest sticks claim supply first; anything unplaced re-nests against
    // whatever supply is left. Each pass either consumes supply or shrinks the
    // usable length set, so the loop terminates.
    sticks.sort((a, b) => b.used - a.used);
    const unplaced = [];
    let placedCount = 0;
    for (const stick of sticks) {
      const required = stick.used + endCropFt;
      const fit = usable.filter(l => l >= required && remainingCap.get(l) > 0).sort((a, b) => a - b);
      if (fit.length > 0) {
        stick.stockLength = fit[0];
        remainingCap.set(fit[0], remainingCap.get(fit[0]) - 1);
        sticksOut.push(stick);
        placedCount++;
      } else {
        unplaced.push(...stick.cuts);
      }
    }
    if (placedCount === 0) {
      // Safety net — should be unreachable since the longest in-supply length
      // always fits a freshly packed stick.
      shortfall.push(...unplaced);
      break;
    }
    pending = unplaced.sort((a, b) => b.length - a.length);
  }

  return { sticks: sticksOut, overLength, shortfall };
};

// Nest all pooled materials across items.
// getLengths(category, size) supplies the purchasable lengths per size, so
// supplier-availability overrides flow into the nest.
// Returns null-safe structure:
//   groups: [{ key, category, size, weightPerFoot, sticks, purchase, buyLengthFt,
//              netLengthFt, yield, overLengthCuts }]
//   byMaterial: Map(materialId -> { groupKey, yield, allocStockLengthFt, overLength })
// Above this many total pieces, live nesting suspends (lines price standalone
// and the Material Nesting card explains). Real estimates sit far below this —
// hitting it almost always means a quantity typo, and nesting an absurd count
// on every keystroke would lock the UI thread.
const MAX_NEST_PIECES = 50000;

const computeProjectNest = (items, kerfFt, endCropFt, getLengths = getStockLengthsForCategory, getCaps = () => ({})) => {
  // Guard before expanding cuts so a runaway piece count can't allocate
  // millions of objects.
  let totalPieces = 0;
  items.forEach(item => {
    if (item.priceStandalone) return;
    (item.materials || []).forEach(mat => {
      if (isNestableMaterial(mat)) totalPieces += mat.pieces || 0;
    });
  });
  if (totalPieces > MAX_NEST_PIECES) {
    return { groups: [], byMaterial: new Map(), tooManyPieces: totalPieces };
  }

  const groups = new Map();

  items.forEach(item => {
    if (item.priceStandalone) return;
    (item.materials || []).forEach(mat => {
      if (!isNestableMaterial(mat)) return;
      const key = `${mat.category}|${mat.size}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          category: mat.category,
          size: mat.size,
          weightPerFoot: mat.weightPerFoot || 0,
          cuts: [],
          materialIds: [],
        });
      }
      const g = groups.get(key);
      if (!g.weightPerFoot && mat.weightPerFoot) g.weightPerFoot = mat.weightPerFoot;
      g.materialIds.push(mat.id);
      for (let p = 0; p < (mat.pieces || 0); p++) {
        g.cuts.push({ materialId: mat.id, itemNumber: item.itemNumber, length: mat.length });
      }
    });
  });

  const byMaterial = new Map();
  const resultGroups = [];

  for (const g of groups.values()) {
    const stockLengths = getLengths(g.category, g.size);
    const caps = getCaps(g.category, g.size) || {};
    const { sticks, overLength, shortfall } = nestCutsFFD(g.cuts, stockLengths, kerfFt, endCropFt, caps);

    // Purchased length: nested sticks at mill length; over-length and
    // shortfall cuts are flagged and carried at their exact length so the
    // group yield stays sane.
    const nestedBuyFt = sticks.reduce((s, st) => s + st.stockLength, 0);
    const carriedFt = [...overLength, ...shortfall].reduce((s, c) => s + c.length, 0);
    const buyLengthFt = nestedBuyFt + carriedFt;
    const netLengthFt = g.cuts.reduce((s, c) => s + c.length, 0);
    const yieldFactor = netLengthFt > 0 ? buyLengthFt / netLengthFt : 1;

    // Purchase summary: stockLength -> stick count
    const purchaseMap = new Map();
    sticks.forEach(st => purchaseMap.set(st.stockLength, (purchaseMap.get(st.stockLength) || 0) + 1));
    const purchase = [...purchaseMap.entries()]
      .map(([stockLength, count]) => ({ stockLength, count }))
      .sort((a, b) => a.stockLength - b.stockLength);

    const overLengthMatIds = new Set(overLength.map(c => c.materialId));
    const shortfallMatIds = new Set(shortfall.map(c => c.materialId));

    for (const matId of new Set(g.materialIds)) {
      const matNetFt = g.cuts.filter(c => c.materialId === matId).reduce((s, c) => s + c.length, 0);
      byMaterial.set(matId, {
        groupKey: g.key,
        yield: yieldFactor,
        allocStockLengthFt: matNetFt * yieldFactor,
        overLength: overLengthMatIds.has(matId),
        shortfall: shortfallMatIds.has(matId),
      });
    }

    resultGroups.push({
      key: g.key,
      category: g.category,
      size: g.size,
      weightPerFoot: g.weightPerFoot,
      sticks,
      purchase,
      buyLengthFt,
      netLengthFt,
      yield: yieldFactor,
      overLengthCuts: overLength,
      shortfallCuts: shortfall,
    });
  }

  resultGroups.sort((a, b) => a.size.localeCompare(b.size));
  return { groups: resultGroups, byMaterial };
};

// Compress a nest group's sticks for display/print: identical sticks (same
// stock length + same cut mix) collapse into one row × N.
const compressGroupSticks = (g) => {
  const bySig = new Map();
  g.sticks.forEach(st => {
    const cutCounts = new Map();
    st.cuts.forEach(c => {
      const k = `${c.length}|${c.itemNumber}`;
      cutCounts.set(k, (cutCounts.get(k) || 0) + 1);
    });
    const parts = [...cutCounts.entries()]
      .map(([k, n]) => {
        const [len, itemNo] = k.split('|');
        return { len: parseFloat(len), itemNo, n };
      })
      .sort((a, b) => b.len - a.len);
    const sig = `${st.stockLength}::` + parts.map(p => `${p.n}x${p.len}@${p.itemNo}`).join(',');
    if (!bySig.has(sig)) {
      const usedFt = st.cuts.reduce((s, c) => s + c.length, 0);
      bySig.set(sig, { stockLength: st.stockLength, parts, usedFt, count: 0 });
    }
    bySig.get(sig).count += 1;
  });
  return [...bySig.values()];
};

export {
  NEST_EXCLUDED_CATEGORIES, isNestableMaterial, nestCutsFFD,
  MAX_NEST_PIECES, computeProjectNest, compressGroupSticks,
};
