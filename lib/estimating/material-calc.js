// Material calculation: weight-per-foot resolution (AISC / plate dims /
// custom), stock-length selection with manual override, waste/efficiency,
// and cost extension per pricing unit (LB / CWT / LF / EA).
// FINDINGS.md #5 (dimension-less plates price at zero) and the downstream half
// of #6 (over-length pieces price at net weight) live here, frozen as-is.

import { steelDatabase } from './aisc-shapes';
import { plateThicknesses, calcPlateWeightPerFoot } from './plates';
import { getStockLengthsForCategory } from './stock-lengths';
import { calculateOptimalStock } from './stock-optimization';

// Pure: material + options → calculated material (new object).
// options.stockLengthsFor(category, size) supplies purchasable lengths
// (supplier availability overrides); defaults to the category standards.
export function calculateMaterial(material, { stockLengthsFor } = {}) {
  const availableLengthsFor = stockLengthsFor
    || ((category) => getStockLengthsForCategory(category));

    const steelData = steelDatabase[material.size];
    
    // Calculate weight per foot based on category
    let weightPerFoot;
    let displaySize = material.size;
    
    if (material.category === 'Plate' && material.plateThickness && material.plateWidth) {
      // Plate: calculate from thickness × width
      weightPerFoot = calcPlateWeightPerFoot(parseFloat(material.plateThickness), material.plateWidth);
      // Find thickness label for display
      const thicknessInfo = plateThicknesses.find(t => t.value === parseFloat(material.plateThickness));
      const thickLabel = thicknessInfo ? thicknessInfo.label : material.plateThickness + '"';
      displaySize = `PL ${thickLabel} × ${material.plateWidth}"`;
    } else if (material.customWeight) {
      weightPerFoot = material.customWeight;
    } else {
      weightPerFoot = steelData ? steelData.weight : 0;
    }
    
    const totalLength = (material.pieces || 0) * (material.length || 0);
    const fabWeight = totalLength * weightPerFoot;
    
    // Get available stock lengths for this size (supplier overrides) / category
    const availableStockLengths = availableLengthsFor(material.category, material.size);
    
    // Calculate optimal nesting
    const optimization = calculateOptimalStock(material.pieces, material.length, availableStockLengths);
    
    // Use manual stockLength if set and valid, otherwise use optimal
    let stockLen = material.stockLength;
    let isManualOverride = false;
    
    // Validate stockLength is available for this category
    if (!stockLen || !availableStockLengths.includes(stockLen)) {
      stockLen = optimization.optimalLength;
    } else if (stockLen !== optimization.optimalLength) {
      isManualOverride = true;
    }
    
    // Calculate stocks required with the selected stock length
    let stocksRequired = 0;
    let stockWeight = fabWeight;
    let piecesPerStock = 0;
    let wasteLength = 0;
    let efficiency = 0;
    
    if (material.pieces > 0 && material.length > 0 && stockLen >= material.length) {
      piecesPerStock = Math.floor(stockLen / material.length);
      stocksRequired = Math.ceil(material.pieces / piecesPerStock);
      stockWeight = stocksRequired * stockLen * weightPerFoot;
      const totalStockLength = stocksRequired * stockLen;
      wasteLength = totalStockLength - totalLength;
      efficiency = (totalLength / totalStockLength) * 100;
    }
    
    let totalCost = 0;
    const unitPrice = material.unitPrice || 0;
    if (material.priceBy === 'LB') {
      totalCost = stockWeight * unitPrice;
    } else if (material.priceBy === 'CWT') {
      totalCost = (stockWeight / 100) * unitPrice; // supplier price per hundredweight
    } else if (material.priceBy === 'LF') {
      totalCost = (stocksRequired * stockLen) * unitPrice;
    } else if (material.priceBy === 'EA') {
      totalCost = material.pieces * unitPrice;
    }
    
    // Auto-generate description for Plate if not manually set
    const description = material.category === 'Plate' && (!material.description || material.description.startsWith('PL '))
      ? displaySize
      : material.description;
    
    return { 
      ...material, 
      description: description || material.description,
      size: material.category === 'Plate' ? displaySize : material.size,
      weightPerFoot, 
      totalLength, 
      fabWeight, 
      stockLength: stockLen,
      optimalStockLength: optimization.optimalLength,
      isManualOverride,
      stocksRequired, 
      stockWeight, 
      piecesPerStock,
      wasteLength,
      efficiency,
      totalCost 
    };
}
