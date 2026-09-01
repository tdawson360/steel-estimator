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

// Sum of galvanized connection-op galv weights on one material
function connGalvWeight(mat) {
  let sum = 0;
  for (const f of mat.fabrication || []) {
    if (f.galvanized && f.galvWeight > 0 && !f.isAutoGalv && !f.isConnGalv) sum += f.galvWeight;
  }
  return sum;
}

// Does this galvanized child ride in its parent's dip?
export function isCoveredByParent(mat, materials) {
  if (!mat.parentMaterialId || !mat.galvanized) return false;
  const parent = materials.find(m => m.id === mat.parentMaterialId);
  return !!(parent && parent.galvanized);
}

// Weight of the galv line that belongs on `mat` (call only for galvanized
// materials that carry their own line).
export function galvLineQty(mat, materials) {
  let qty = (mat.fabWeight || 0) + connGalvWeight(mat);
  if (!mat.parentMaterialId) {
    for (const m of materials) {
      if (m.parentMaterialId === mat.id && m.galvanized) {
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
export function normalizeGalvLines(materials) {
  const list = materials || [];
  return list.map(mat => {
    const fabs = mat.fabrication || [];
    const out = [];
    let changed = false;

    const ownsAutoLine = !!mat.galvanized && !isCoveredByParent(mat, list);
    const targetQty = ownsAutoLine ? galvLineQty(mat, list) : 0;
    const coveredChildCount = !mat.parentMaterialId
      ? list.filter(m => m.parentMaterialId === mat.id && m.galvanized).length
      : 0;
    const galvDesc = `Galv - ${mat.description || mat.size || mat.shape || ''}`
      + (ownsAutoLine && coveredChildCount > 0 ? ' + attachments' : '');

    let sawAutoLine = false;
    for (const f of fabs) {
      if (f.isAutoGalv) {
        if (!ownsAutoLine) { changed = true; continue; }          // covered or un-galved: drop
        sawAutoLine = true;
        if ((f.quantity || 0) !== targetQty || f.description !== galvDesc) {
          changed = true;
          out.push({ ...f, quantity: targetQty, description: galvDesc, totalCost: targetQty * (f.unitPrice || 0) });
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
      out.push({
        id: `autogalv-${mat.id}`,
        operation: 'Galvanizing',
        description: galvDesc,
        quantity: targetQty,
        unit: 'LB',
        unitPrice: mat.galvRate || 0,
        totalCost: targetQty * (mat.galvRate || 0),
        multiplyByPieces: false,
        isAutoGalv: true,
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
export const GALV_MINIMUM_CHARGE = 300;

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
