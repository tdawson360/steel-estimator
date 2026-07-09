// Item and project totals — THE single implementations of the tax rules,
// item total, breakout totals, and project totals, plus line-item cost
// breakdowns for per-material / per-item addressability.
//
// Collapsed duplicates (proven equal by the characterization suite before the
// merge): calculateItemTax vs getItemTaxBreakdown, and getItemTotal
// (component) vs getItemTotal (components/pdf/pdfUtils.js).
//
// FINDINGS.md #3 lives here, frozen: getItemTotal (and therefore breakout
// base bid on the Quote tab) has NO tax term, while projectTotals.grandTotal
// (saved as bidAmount) includes tax.

import { CONNECTION_WEIGHT_OPS } from './fab-operations';
import { fmtPrice } from './format';

// ── Tax (single implementation) ──────────────────────────────────────────────
// Full per-item tax breakdown for a tax category. rates.taxRate applies.
export function itemTaxBreakdown(item, taxCategory, rates) {

    const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
    const matMarkupPct = item.materialMarkup || 0;
    const matMarkup = matCost * matMarkupPct / 100;
    const matFabCost = item.materials.reduce((s, m) => s + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0);
    const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
    const fabCost = matFabCost + itemFabCost;
    const fabMarkupPct = item.fabMarkup || 0;
    const fabMarkup = fabCost * fabMarkupPct / 100;
    const recapTotal = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);

    let taxableBase = 0;
    let taxableComponents = [];
    let notTaxed = [];

    if (!taxCategory || taxCategory === 'resale' || taxCategory === 'noTax') {
      notTaxed = ['Materials', 'Material Markup', 'Fabrication', 'Fab Markup', 'Recap Costs'];
    } else if (taxCategory === 'newConstruction') {
      taxableBase = matCost + matMarkup;
      if (matCost > 0) taxableComponents.push({ label: 'Material Cost', amount: matCost });
      if (matMarkup > 0) taxableComponents.push({ label: `Material Markup (${matMarkupPct}%)`, amount: matMarkup });
      notTaxed = [];
      if (fabCost > 0) notTaxed.push(`Fabrication (${fmtPrice(fabCost)})`);
      if (fabMarkup > 0) notTaxed.push(`Fab Markup (${fmtPrice(fabMarkup)})`);
      if (recapTotal > 0) notTaxed.push(`Recap/Labor (${fmtPrice(recapTotal)})`);
    } else if (taxCategory === 'fob') {
      taxableBase = matCost + matMarkup + fabCost + fabMarkup;
      if (matCost > 0) taxableComponents.push({ label: 'Material Cost', amount: matCost });
      if (matMarkup > 0) taxableComponents.push({ label: `Material Markup (${matMarkupPct}%)`, amount: matMarkup });
      if (fabCost > 0) taxableComponents.push({ label: 'Fabrication Cost', amount: fabCost });
      if (fabMarkup > 0) taxableComponents.push({ label: `Fab Markup (${fabMarkupPct}%)`, amount: fabMarkup });
      notTaxed = [];
      if (recapTotal > 0) notTaxed.push(`Recap/Labor (${fmtPrice(recapTotal)})`);
    }

    const taxAmount = taxableBase * rates.taxRate;
    return { taxableBase, taxableComponents, notTaxed, taxAmount, matCost, matMarkup, fabCost, fabMarkup, recapTotal };
}

// Tax amount only. Delegates to the breakdown — same expression the old
// calculateItemTax computed ((base components summed in the same order) × rate).
export function calculateItemTax(item, taxCategory, rates) {
  return itemTaxBreakdown(item, taxCategory, rates).taxAmount;
}

// ── Recap entry total (single implementation of the Recap-tab rule) ─────────
// projectManagement: hours × rate; everything else: cost × (1 + markup%/100).
export function recapEntryTotal(costType, entry) {
  if (costType === 'projectManagement') {
    return entry.hours * entry.rate;
  }
  const baseCost = entry.cost || 0;
  const markupPct = entry.markup || 0;
  return baseCost + (baseCost * markupPct / 100);
}

// ── Item total (single implementation; NO tax term — FINDINGS.md #3) ────────
export function getItemTotal(item) {

    const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
    // Include material-level fab costs
    const matFabCost = item.materials.reduce((s, m) => {
      return s + (m.fabrication ? m.fabrication.reduce((fs, f) => fs + (f.totalCost || 0), 0) : 0);
    }, 0);
    // Plus item-level fab costs
    const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
    const totalFabCost = matFabCost + itemFabCost;
    // Apply separate markups to material and fab costs
    const markedUpMatCost = matCost * (1 + (item.materialMarkup || 0) / 100);
    const markedUpFabCost = totalFabCost * (1 + (item.fabMarkup || 0) / 100);
    // Add recap costs (not marked up)
    const recapCost = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
    return markedUpMatCost + markedUpFabCost + recapCost;
}

// ── Breakout totals (Quote tab: base bid + deduct/add options) ──────────────
export function calculateBreakoutTotals(items, breakoutGroups, adjustments) {

    const result = {
      baseBid: 0,
      deducts: [],
      adds: []
    };

    // Get items with no group or base group - these are always in base bid
    items.forEach(item => {
      const itemTotal = getItemTotal(item);
      const group = breakoutGroups.find(g => g.id === item.breakoutGroupId);
      
      if (!group || group.type === 'base') {
        result.baseBid += itemTotal;
      } else if (group.type === 'deduct') {
        // Deducts are included in base bid but shown as options
        result.baseBid += itemTotal;
      }
      // Add items are NOT included in base bid
    });

    // Add adjustments to base bid (internal - baked in but not shown separately on quote)
    const totalAdjustments = adjustments.reduce((sum, adj) => sum + (parseFloat(adj.amount) || 0), 0);
    result.baseBid += totalAdjustments;

    // Calculate deduct totals
    breakoutGroups.filter(g => g.type === 'deduct').forEach(group => {
      const groupItems = items.filter(i => i.breakoutGroupId === group.id);
      const total = groupItems.reduce((s, i) => s + getItemTotal(i), 0);
      if (total > 0) {
        result.deducts.push({ ...group, total, items: groupItems });
      }
    });

    // Calculate add totals
    breakoutGroups.filter(g => g.type === 'add').forEach(group => {
      const groupItems = items.filter(i => i.breakoutGroupId === group.id);
      const total = groupItems.reduce((s, i) => s + getItemTotal(i), 0);
      if (total > 0) {
        result.adds.push({ ...group, total, items: groupItems });
      }
    });

    return result;
}

// ── Project totals (grandTotal = bidAmount) + line-item breakdowns ──────────
export function projectTotals(items, adjustments, taxCategory, rates) {
  const calcTotals = () => {

    let totalMaterialCost = 0;
    let totalFabricationCost = 0;
    let totalFabWeight = 0;
    let totalStockWeight = 0;
    let totalRecapCosts = 0;
    let totalMaterialMarkup = 0;
    let totalFabMarkup = 0;
    let totalConnectionWeight = 0;

    items.forEach(item => {
      let itemMatCost = 0;
      let itemFabCost = 0;
      
      item.materials.forEach(mat => {
        itemMatCost += mat.totalCost || 0;
        totalFabWeight += mat.fabWeight || 0;
        totalStockWeight += mat.stockWeight || 0;
        // Add material-level fabrication costs and connection weights
        if (mat.fabrication) {
          mat.fabrication.forEach(fab => {
            itemFabCost += fab.totalCost || 0;
            // Add connection weights
            if (CONNECTION_WEIGHT_OPS.has(fab.operation) && fab.connWeight) {
              totalConnectionWeight += (fab.quantity || 0) * fab.connWeight;
            }
          });
        }
      });
      // Add item-level fabrication costs
      item.fabrication.forEach(fab => {
        itemFabCost += fab.totalCost || 0;
      });
      
      // Calculate markups for this item (separate material and fab)
      const matMarkupAmount = itemMatCost * ((item.materialMarkup || 0) / 100);
      const fabMarkupAmount = itemFabCost * ((item.fabMarkup || 0) / 100);
      totalMaterialMarkup += matMarkupAmount;
      totalFabMarkup += fabMarkupAmount;
      
      // Add to totals (before markup)
      totalMaterialCost += itemMatCost;
      totalFabricationCost += itemFabCost;
      
      // Add recap costs
      Object.values(item.recapCosts).forEach(cost => {
        totalRecapCosts += cost.total || 0;
      });
    });

    const totalMarkup = totalMaterialMarkup + totalFabMarkup;
    const totalTax = items.reduce((s, i) => s + calculateItemTax(i, taxCategory, rates), 0);
    const subtotal = totalMaterialCost + totalFabricationCost + totalMarkup + totalRecapCosts + totalTax;
    const totalAdjustments = adjustments.reduce((sum, adj) => sum + (parseFloat(adj.amount) || 0), 0);
    const grandTotal = subtotal + totalAdjustments;

    return { totalMaterialCost, totalFabricationCost, totalMaterialMarkup, totalFabMarkup, totalMarkup, totalRecapCosts, totalTax, totalFabWeight, totalStockWeight, totalConnectionWeight, subtotal, totalAdjustments, grandTotal };
  };
  return {
    totals: calcTotals(),
    items: items.map((item) => itemBreakdown(item, taxCategory, rates)),
  };
}

// Recap-table breakdown used by the Job Folder PDF (moved verbatim from
// components/pdf/pdfUtils.js — kept as-is; its shape is snapshot-pinned).
export function getItemCostBreakdown(item) {
  const material = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
  const matFabCost = item.materials.reduce((s, m) => {
    return s + (m.fabrication ? m.fabrication.reduce((fs, f) => fs + (f.totalCost || 0), 0) : 0);
  }, 0);
  const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
  const fabrication = matFabCost + itemFabCost;
  const recapCost = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
  const matMarkupAmt = material * (item.materialMarkup || 0) / 100;
  const fabMarkupAmt = fabrication * (item.fabMarkup || 0) / 100;
  const total = getItemTotal(item);
  return { material, matMarkupAmt, fabrication, fabMarkupAmt, recapCost, total };
}

// ── Line-item addressability (new, additive outputs) ────────────────────────
// "What does this member cost and why" without recomputation.
export function materialBreakdown(material) {
  const fabLines = (material.fabrication || []).map((f) => ({
    fabId: f.id,
    operation: f.operation,
    quantity: f.quantity || 0,
    unit: f.unit || 'EA',
    rate: f.unitPrice || 0,
    totalCost: f.totalCost || 0,
    connectionWeight: CONNECTION_WEIGHT_OPS.has(f.operation) && f.connWeight
      ? (f.quantity || 0) * f.connWeight
      : 0,
  }));
  return {
    materialId: material.id,
    sequence: material.sequence,
    size: material.size,
    description: material.description || '',
    category: material.category,
    pieces: material.pieces || 0,
    length: material.length || 0,
    priceBy: material.priceBy,
    unitPrice: material.unitPrice || 0,
    weightPerFoot: material.weightPerFoot || 0,
    fabWeight: material.fabWeight || 0,
    stockLength: material.stockLength || 0,
    stocksRequired: material.stocksRequired || 0,
    stockWeight: material.stockWeight || 0,
    pooled: !!material.pooled,
    materialCost: material.totalCost || 0,
    fabLines,
    fabCost: fabLines.reduce((s, f) => s + f.totalCost, 0),
    connectionWeight: fabLines.reduce((s, f) => s + f.connectionWeight, 0),
    lineTotal: (material.totalCost || 0) + fabLines.reduce((s, f) => s + f.totalCost, 0),
  };
}

export function itemBreakdown(item, taxCategory, rates) {
  const materials = (item.materials || []).map(materialBreakdown);
  const materialCost = materials.reduce((s, m) => s + m.materialCost, 0);
  const materialFabCost = materials.reduce((s, m) => s + m.fabCost, 0);
  const itemFabLines = (item.fabrication || []).map((f) => ({
    fabId: f.id,
    operation: f.operation,
    quantity: f.quantity || 0,
    unit: f.unit || 'EA',
    rate: f.unitPrice || 0,
    totalCost: f.totalCost || 0,
  }));
  const itemFabCost = itemFabLines.reduce((s, f) => s + f.totalCost, 0);
  const fabricationCost = materialFabCost + itemFabCost;
  const materialMarkupAmt = materialCost * ((item.materialMarkup || 0) / 100);
  const fabMarkupAmt = fabricationCost * ((item.fabMarkup || 0) / 100);
  const recapTotal = Object.values(item.recapCosts || {}).reduce((s, c) => s + (c.total || 0), 0);
  const tax = calculateItemTax(item, taxCategory, rates);
  return {
    itemId: item.id,
    itemNumber: item.itemNumber,
    itemName: item.itemName,
    materials,
    itemFabLines,
    materialCost,
    materialFabCost,
    itemFabCost,
    fabricationCost,
    materialMarkupPct: item.materialMarkup || 0,
    fabMarkupPct: item.fabMarkup || 0,
    materialMarkupAmt,
    fabMarkupAmt,
    recapTotal,
    tax,
    fabWeight: materials.reduce((s, m) => s + m.fabWeight, 0),
    stockWeight: materials.reduce((s, m) => s + m.stockWeight, 0),
    connectionWeight: materials.reduce((s, m) => s + m.connectionWeight, 0),
    // getItemTotal semantics (no tax — FINDINGS.md #3):
    itemTotal: getItemTotal(item),
    // and the tax-inclusive figure for consumers that want it explicit:
    itemTotalWithTax: getItemTotal(item) + tax,
  };
}
