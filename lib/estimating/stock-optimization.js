// Per-line stock optimization: pick the mill length with least waste for a
// run of identical pieces. FINDINGS.md #6 (over-length pieces return
// waste=Infinity, priced at net weight downstream) lives here, frozen as-is.

// Nesting optimization calculator
const calculateOptimalStock = (pieces, length, availableStockLengths) => {
  if (!pieces || pieces <= 0 || !length || length <= 0) {
    return { optimalLength: availableStockLengths[0], stocksRequired: 0, waste: 0, efficiency: 0 };
  }
  
  let bestResult = {
    optimalLength: availableStockLengths[0],
    stocksRequired: pieces,
    waste: Infinity,
    efficiency: 0,
    piecesPerStock: 1
  };
  
  for (const stockLen of availableStockLengths) {
    if (stockLen < length) continue; // Skip if piece doesn't fit
    
    const piecesPerStock = Math.floor(stockLen / length);
    if (piecesPerStock <= 0) continue;
    
    const stocksNeeded = Math.ceil(pieces / piecesPerStock);
    const totalStockLength = stocksNeeded * stockLen;
    const totalUsedLength = pieces * length;
    const totalWaste = totalStockLength - totalUsedLength;
    const efficiency = (totalUsedLength / totalStockLength) * 100;
    
    // Better solution if less waste (or same waste but shorter stock — easier to handle in the shop)
    if (totalWaste < bestResult.waste ||
        (totalWaste === bestResult.waste && stockLen < bestResult.optimalLength)) {
      bestResult = {
        optimalLength: stockLen,
        stocksRequired: stocksNeeded,
        waste: totalWaste,
        efficiency: efficiency,
        piecesPerStock: piecesPerStock
      };
    }
  }
  
  return bestResult;
};

export { calculateOptimalStock };
