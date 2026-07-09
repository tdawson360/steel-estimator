// Stock material buy list aggregation: per-line stocks for non-pooled
// materials plus the nest's purchase summary for pooled groups.
// Bodies moved verbatim from the component; items/projectNest are parameters.

// Aggregated buy list: one row per size + stock length
export function buildStockSummary(items, projectNest) {

    const stockSummary = {};
    const addStocks = (size, stockLength, weightPerFoot, count) => {
      const key = `${size}-${stockLength}`;
      if (!stockSummary[key]) {
        stockSummary[key] = { size, stockLength, weightPerFoot: weightPerFoot || 0, totalStocks: 0, totalWeight: 0 };
      }
      stockSummary[key].totalStocks += count;
      stockSummary[key].totalWeight += count * stockLength * (weightPerFoot || 0);
    };
    items.forEach(item => {
      item.materials.forEach(mat => {
        if (projectNest && mat.pooled) return; // covered by the nest below
        if (mat.size && mat.stocksRequired > 0) {
          addStocks(mat.size, mat.stockLength, mat.weightPerFoot, mat.stocksRequired);
        }
      });
    });
    if (projectNest) {
      projectNest.groups.forEach(g => {
        g.purchase.forEach(p => addStocks(g.size, p.stockLength, g.weightPerFoot, p.count));
      });
    }
    return Object.values(stockSummary).sort((a, b) => a.size.localeCompare(b.size));
}

// Per-item breakdown rows plus pooled rows for the Stock List display
export function buildDetailedStockList(items, projectNest) {

    const result = [];
    items.forEach(item => {
      const perItem = {};
      item.materials.forEach(mat => {
        if (projectNest && mat.pooled) return; // shown as pooled rows below
        if (mat.size && mat.stocksRequired > 0) {
          const key = `${mat.size}-${mat.stockLength}`;
          if (!perItem[key]) {
            perItem[key] = {
              itemNumber: item.itemNumber,
              itemName: item.itemName,
              size: mat.size,
              stockLength: mat.stockLength,
              weightPerFoot: mat.weightPerFoot || 0,
              totalStocks: 0,
              totalWeight: 0,
            };
          }
          perItem[key].totalStocks += mat.stocksRequired;
          perItem[key].totalWeight += mat.stocksRequired * mat.stockLength * (mat.weightPerFoot || 0);
        }
      });
      result.push(...Object.values(perItem));
    });
    if (projectNest) {
      projectNest.groups.forEach(g => {
        const itemNumbers = [...new Set(g.sticks.flatMap(st => st.cuts.map(c => c.itemNumber)))]
          .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        g.purchase.forEach(p => {
          result.push({
            itemNumber: 'Pooled',
            itemName: `Items ${itemNumbers.join(', ')}`,
            size: g.size,
            stockLength: p.stockLength,
            weightPerFoot: g.weightPerFoot,
            totalStocks: p.count,
            totalWeight: p.count * p.stockLength * (g.weightPerFoot || 0),
            pooled: true,
          });
        });
      });
    }
    return result;
}
