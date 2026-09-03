// Galvanizing assembly rules — one dipped assembly, one line, one rate.
//
// A galvanized PARENT's auto-galv line covers the whole assembly: its own fab
// weight, every galvanized child's fab weight, and the galvanized
// connection-op galv weights on itself and those children. Covered children
// and covered connection ops carry no galv lines of their own — welded
// attachments go into the kettle with their member and are never priced at a
// separate rate.
//
// A galvanized CHILD under a non-galvanized parent still dips alone: it keeps
// its own line (own weight + its galvanized connection weights).
//
// A galvanized connection op on a NON-galvanized material keeps its standalone
// conn-galv line (the connection hardware dips even though the member doesn't).
//
// Pure module: works on the flat client/payload materials array
// (parentMaterialId links children). Used by both the estimator UI and the
// server recompute engine so persisted totals can never drift.

import { defaultGalvClassCode, galvClassRatePerLb } from './galv-classes';

// Live rate classes for callers that can't pass them (the estimator's many
// normalizeGalvLines call sites, some inside harness-sliced handlers). The
// client sets this once after fetching /api/galv-classes; the engine never
// depends on it — with no classes, new lines fall back to mat.galvRate.
let configuredGalvClasses = null;
export function configureGalvClasses(classes) {
  configuredGalvClasses = Array.isArray(classes) ? classes : null;
}
export function getConfiguredGalvClasses() {
  return configuredGalvClasses;
}

// Sum of galvanized connection-op galv weights on one material
function connGalvWeight(mat) {
  let sum = 0;
  for (const f of mat.fabrication || []) {
    if (f.galvanized && f.galvWeight > 0 && !f.isAutoGalv && !f.isConnGalv) sum += f.galvWeight;
  }
  return sum;
}

// Does this material go to the galvanizer? Hardware (bolts, anchors,
// adhesive) is bought already galvanized — its Galv flag switches the row to
// the HDG-priced catalog item and never adds weight to a dip or a galv group.
export function dipsInKettle(mat) {
  return !!mat?.galvanized && mat.category !== 'Hardware';
}

// Does this galvanized child ride in its parent's dip?
export function isCoveredByParent(mat, materials) {
  if (!mat.parentMaterialId || !dipsInKettle(mat)) return false;
  const parent = materials.find(m => m.id === mat.parentMaterialId);
  return !!(parent && dipsInKettle(parent));
}

// Weight of the galv line that belongs on `mat` (call only for galvanized
// materials that carry their own line).
export function galvLineQty(mat, materials) {
  let qty = (mat.fabWeight || 0) + connGalvWeight(mat);
  if (!mat.parentMaterialId) {
    for (const m of materials) {
      if (m.parentMaterialId === mat.id && dipsInKettle(m)) {
        qty += (m.fabWeight || 0) + connGalvWeight(m);
      }
    }
  }
  return qty;
}

// Reconcile every galv line in a flat materials array against the rules:
// add missing lines, remove covered/foldable ones, resync quantities and
// descriptions. Existing lines keep their unitPrice; new lines start at the
// material's galvRate (or 0). Returns a new array; fabrication arrays are
// only replaced when something actually changed.
export function normalizeGalvLines(materials, { galvClasses } = {}) {
  const classes = galvClasses ?? configuredGalvClasses;
  const list = materials || [];
  return list.map(mat => {
    const fabs = mat.fabrication || [];
    const out = [];
    let changed = false;

    const ownsAutoLine = dipsInKettle(mat) && !isCoveredByParent(mat, list);
    const targetQty = ownsAutoLine ? galvLineQty(mat, list) : 0;
    const coveredChildCount = !mat.parentMaterialId
      ? list.filter(m => m.parentMaterialId === mat.id && dipsInKettle(m)).length
      : 0;
    const galvDesc = `Galv - ${mat.description || mat.size || mat.shape || ''}`
      + (ownsAutoLine && coveredChildCount > 0 ? ' + attachments' : '');

    let sawAutoLine = false;
    for (const f of fabs) {
      if (f.isAutoGalv) {
        if (!ownsAutoLine) { changed = true; continue; }          // covered or un-galved: drop
        sawAutoLine = true;
        // Class is assigned once (default from the main member) and then
        // belongs to the estimator; the rate is never re-seeded here.
        const galvClass = f.galvClass || defaultGalvClassCode(mat, targetQty);
        // An UNPRICED line ($0, "needs pricing") takes the class rate; a
        // priced line keeps whatever the estimator set.
        const seeded = !f.unitPrice ? galvClassRatePerLb(classes, galvClass) : null;
        const unitPrice = seeded || (f.unitPrice || 0);
        if ((f.quantity || 0) !== targetQty || f.description !== galvDesc || galvClass !== f.galvClass || unitPrice !== (f.unitPrice || 0)) {
          changed = true;
          out.push({ ...f, quantity: targetQty, description: galvDesc, galvClass, unitPrice, rate: unitPrice, totalCost: targetQty * unitPrice });
        } else {
          out.push(f);
        }
        continue;
      }
      if (f.isConnGalv) {
        const parentFab = fabs.find(pf => pf.id === f.parentFabId);
        const keep = !mat.galvanized && parentFab && parentFab.galvanized && parentFab.galvWeight > 0;
        if (!keep) { changed = true; continue; }                  // folded into an assembly line
        const qty = parentFab.galvWeight;
        if ((f.quantity || 0) !== qty) {
          changed = true;
          out.push({ ...f, quantity: qty, totalCost: qty * (f.unitPrice || 0) });
        } else {
          out.push(f);
        }
        continue;
      }
      out.push(f);
    }

    if (ownsAutoLine && !sawAutoLine) {
      changed = true;
      // New line: class from the main member, rate from the class table
      // (Global Pricing Data); falls back to the material's galvRate.
      const galvClass = defaultGalvClassCode(mat, targetQty);
      const seeded = galvClassRatePerLb(classes, galvClass);
      const unitPrice = seeded != null ? seeded : (mat.galvRate || 0);
      out.push({
        id: `autogalv-${mat.id}`,
        operation: 'Galvanizing',
        description: galvDesc,
        quantity: targetQty,
        unit: 'LB',
        unitPrice,
        totalCost: targetQty * unitPrice,
        multiplyByPieces: false,
        isAutoGalv: true,
        galvClass,
      });
    }

    // Standalone conn-galv lines missing on a non-galvanized material
    if (!mat.galvanized) {
      for (const f of fabs) {
        if (f.isAutoGalv || f.isConnGalv) continue;
        if (f.galvanized && f.galvWeight > 0 && !out.some(g => g.isConnGalv && g.parentFabId === f.id)) {
          changed = true;
          out.push({
            id: `galv-${f.id}`,
            operation: 'Galvanizing',
            description: `Galv - ${f.operation}`,
            quantity: f.galvWeight,
            unit: 'LB',
            unitPrice: 0,
            totalCost: 0,
            isConnGalv: true,
            parentFabId: f.id,
          });
        }
      }
    }

    return changed ? { ...mat, fabrication: out } : mat;
  });
}

// Project-wide galvanizing spend (every galv line, any flavor) — drives the
// galvanizer minimum-charge check on the Summary tab.
// AZZ Houston quote 4112510011147 (eff. 10/01/2025): minimum charge $325 per lot.
export const GALV_MINIMUM_CHARGE = 325;

export function projectGalvTotal(items) {
  let total = 0;
  for (const item of items || []) {
    for (const mat of item.materials || []) {
      for (const f of mat.fabrication || []) {
        if (f.isAutoGalv || f.isConnGalv || f.isGalvLine) total += f.totalCost || 0;
      }
    }
  }
  return total;
}
