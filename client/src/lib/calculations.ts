import type { EstimateItem, Material, RecapCost, SummaryAdjustment, FabOperation } from "@shared/schema";
import { TAX_CATEGORIES } from "@shared/schema";

export function calcMaterialWeight(mat: Material): number {
  return (mat.weightPerFoot || 0) * (mat.length || 0) * (mat.quantity || 1);
}

export function calcStockPieces(mat: Material): number {
  if (!mat.stockLength || mat.stockLength <= 0 || !mat.length || mat.length <= 0) return mat.quantity || 1;
  const piecesPerStock = Math.floor(mat.stockLength / mat.length);
  if (piecesPerStock <= 0) return mat.quantity || 1;
  return Math.ceil((mat.quantity || 1) / piecesPerStock);
}

export function calcStockWeight(mat: Material): number {
  return calcStockPieces(mat) * (mat.weightPerFoot || 0) * (mat.stockLength || 20);
}

export function calcWastePercent(mat: Material): number {
  const stockWt = calcStockWeight(mat);
  const fabWt = calcMaterialWeight(mat);
  if (stockWt <= 0) return 0;
  return ((stockWt - fabWt) / stockWt) * 100;
}

export function calcEfficiencyPercent(mat: Material): number {
  return 100 - calcWastePercent(mat);
}

export function calcFabCost(ops: FabOperation[]): number {
  return ops.reduce((sum, op) => sum + (op.hours * op.rate), 0);
}

export function calcMaterialCost(mat: Material): number {
  return (mat.unitPrice || 0) * calcStockWeight(mat) / (mat.weightPerFoot || 1);
}

export function calcItemMaterialCost(materials: Material[]): number {
  return materials.reduce((sum, mat) => sum + calcMaterialCost(mat), 0);
}

export function calcItemFabCost(materials: Material[], item: EstimateItem): number {
  const matFab = materials.reduce((sum, mat) => sum + calcFabCost(mat.fabOps || []), 0);
  const generalFab = calcFabCost(item.generalFabOps || []);
  return matFab + generalFab;
}

export function calcItemMaterialMarkup(materials: Material[], item: EstimateItem): number {
  return calcItemMaterialCost(materials) * ((item.materialMarkupPercent || 0) / 100);
}

export function calcItemFabMarkup(materials: Material[], item: EstimateItem): number {
  return calcItemFabCost(materials, item) * ((item.fabMarkupPercent || 0) / 100);
}

export function calcItemTotal(materials: Material[], item: EstimateItem): number {
  const matCost = calcItemMaterialCost(materials);
  const matMarkup = calcItemMaterialMarkup(materials, item);
  const fabCost = calcItemFabCost(materials, item);
  const fabMarkup = calcItemFabMarkup(materials, item);
  return matCost + matMarkup + fabCost + fabMarkup;
}

export function calcItemFabWeight(materials: Material[]): number {
  return materials.reduce((sum, mat) => sum + calcMaterialWeight(mat), 0);
}

export function calcItemStockWeight(materials: Material[]): number {
  return materials.reduce((sum, mat) => sum + calcStockWeight(mat), 0);
}

export function calcRecapTotal(recap: RecapCost): number {
  const installation = (recap.installationHours || 0) * (recap.installationRate || 0);
  const drafting = (recap.draftingHours || 0) * (recap.draftingRate || 0);
  const engineering = (recap.engineeringHours || 0) * (recap.engineeringRate || 0);
  const projectMgmt = (recap.projectMgmtHours || 0) * (recap.projectMgmtRate || 0);
  const shipping = recap.shippingCost || 0;
  const customTotal = (recap.customCosts || []).reduce((sum, c) => sum + (c.hours * c.rate), 0);
  const subtotal = installation + drafting + engineering + projectMgmt + shipping + customTotal;
  const markup = subtotal * ((recap.markupPercent || 0) / 100);
  return subtotal + markup;
}

export function calcTax(
  taxCategory: string,
  materialTotal: number,
  fabTotal: number,
): number {
  const cat = TAX_CATEGORIES[taxCategory as keyof typeof TAX_CATEGORIES];
  if (!cat) return 0;
  let taxableAmount = 0;
  if (cat.appliesTo.includes("materials")) taxableAmount += materialTotal;
  if (cat.appliesTo.includes("fabrication")) taxableAmount += fabTotal;
  return taxableAmount * cat.rate;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatWeight(lbs: number): string {
  return `${formatNumber(lbs, 0)} lbs`;
}
