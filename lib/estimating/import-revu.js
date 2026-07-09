// Legacy Revu/Bluebeam markup-list import (7-column format): row parsing
// with 1" length tolerance, and quantity aggregation by item + size + length.

import { parseCSVLine } from './import-takeoff';
import { translateSizeToAISC, normalizeShapeSize } from './sizes';

// Parse CSV content from Revu Markup List export
const parseRevuCSV = (csvContent) => {
  // Strip BOM (Byte Order Mark) if present - common in Windows exports
  let cleanContent = csvContent;
  if (cleanContent.charCodeAt(0) === 0xFEFF) {
    cleanContent = cleanContent.slice(1);
  }
  // Also handle UTF-8 BOM as bytes
  if (cleanContent.startsWith('\uFEFF')) {
    cleanContent = cleanContent.slice(1);
  }
  
  // Clean up encoding artifacts from Windows/Bluebeam exports
  // These appear when UTF-8 is misread as Windows-1252 or vice versa
  cleanContent = cleanContent
    // Check marks - various encodings
    .replace(/\u2713/g, '*')      // Unicode check mark
    .replace(/\u2714/g, '*')      // Heavy check mark
    .replace(/âœ"/g, '*')          // UTF-8 check as Windows-1252
    .replace(/âœ"/g, '*')          // Variant
    .replace(/\xE2\x9C\x93/g, '*') // Raw UTF-8 bytes for check
    .replace(/\xE2\x9C\x94/g, '*') // Raw UTF-8 bytes for heavy check
    // Bullets - various encodings
    .replace(/\u2022/g, '-')      // Unicode bullet
    .replace(/â€¢/g, '-')          // UTF-8 bullet as Windows-1252
    .replace(/\xE2\x80\xA2/g, '-') // Raw UTF-8 bytes for bullet
    .replace(/•/g, '-')           // HTML bullet entity
    // Dashes
    .replace(/\u2013/g, '-')      // En dash
    .replace(/\u2014/g, '--')     // Em dash
    .replace(/â€"/g, '-')          // En dash misencoded
    .replace(/â€"/g, '--')         // Em dash misencoded
    // Quotes
    .replace(/\u201C/g, '"')      // Left double quote
    .replace(/\u201D/g, '"')      // Right double quote
    .replace(/\u2018/g, "'")      // Left single quote
    .replace(/\u2019/g, "'")      // Right single quote
    .replace(/â€œ/g, '"')          // Left double quote misencoded
    .replace(/â€/g, '"')           // Right double quote partial
    .replace(/â€™/g, "'")          // Right single quote misencoded
    .replace(/â€˜/g, "'")          // Left single quote misencoded
    // Other cleanup
    .replace(/\u00A0/g, ' ')      // Non-breaking space
    .replace(/Â/g, '')            // Stray high-bit character
    .replace(/Ã¢/g, '')           // Encoding artifact
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Control characters
  
  const lines = cleanContent.split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [], error: 'CSV file is empty or has no data rows' };
  
  // Parse header row
  const headers = parseCSVLine(lines[0]);
  
  // Find required column indices
  const colMap = {
    itemNumber: findColumnIndex(headers, ['Item #', 'Item Number', 'Item']),
    itemDescription: findColumnIndex(headers, ['Item Description', 'Description']),
    partLabel: findColumnIndex(headers, ['Part Label', 'Label']),
    matSize: findColumnIndex(headers, ['(Non-Flat) Mat Size', 'Mat Size', 'Non-Flat Mat Size', 'Material Size', 'Size']),
    matSizeFlats: findColumnIndex(headers, ['Mat Size (Flats)', 'Flat Mat Size']),
    fabLength: findColumnIndex(headers, ['Fab Length', 'Length']),
    page: findColumnIndex(headers, ['Page', 'page', 'Page Number']),
    qty: findColumnIndex(headers, ['Qty', 'Quantity'])
  };
  
  // Validate required columns
  const missingCols = [];
  if (colMap.itemNumber === -1) missingCols.push('Item #');
  if (colMap.matSize === -1 && colMap.matSizeFlats === -1) missingCols.push('Mat Size');
  if (colMap.fabLength === -1) missingCols.push('Fab Length');
  
  if (missingCols.length > 0) {
    return { headers, rows: [], error: `Missing required columns: ${missingCols.join(', ')}` };
  }
  
  // Parse data rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    
    // Get mat size from either column (prefer non-flat)
    let matSize = colMap.matSize !== -1 ? values[colMap.matSize] : '';
    if (!matSize && colMap.matSizeFlats !== -1) {
      matSize = values[colMap.matSizeFlats];
    }
    
    let fabLength = parseFloat(values[colMap.fabLength]) || 0;
    // Estimating tolerance is 1" — round Bluebeam's noisy decimal lengths to
    // the nearest inch so identical pieces aggregate instead of splitting.
    // Stored at 2 decimals — how estimators read decimal feet (28'-1" → 28.08).
    if (fabLength > 0) {
      fabLength = +(Math.max(Math.round(fabLength * 12), 1) / 12).toFixed(2);
    }

    // Skip rows without mat size or fab length (scope rectangles)
    if (!matSize || fabLength <= 0) continue;
    
    rows.push({
      itemNumber: values[colMap.itemNumber] || '',
      itemDescription: colMap.itemDescription !== -1 ? values[colMap.itemDescription] : '',
      partLabel: colMap.partLabel !== -1 ? values[colMap.partLabel] : '',
      matSize: matSize,
      fabLength: fabLength,
      page: colMap.page !== -1 ? values[colMap.page] : '',
      qty: colMap.qty !== -1 ? (parseInt(values[colMap.qty]) || 1) : 1
    });
  }
  
  return { headers, rows, error: null, colMap };
};

// Find column index by possible names
const findColumnIndex = (headers, possibleNames) => {
  for (const name of possibleNames) {
    const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
};

// Aggregate parsed rows into items structure
const aggregateImportData = (rows) => {
  const itemsMap = new Map();
  // original size string -> { size, rowCount, locations[] } so unmatched sizes
  // can be traced back to the rows they came from in the preview
  const unmatchedSizes = new Map();

  for (const row of rows) {
    const itemKey = row.itemNumber;
    if (!itemKey) continue;
    
    // Get or create item
    if (!itemsMap.has(itemKey)) {
      itemsMap.set(itemKey, {
        itemNumber: row.itemNumber,
        itemName: row.itemDescription || 'Imported Item',
        pages: new Set(),
        materialsMap: new Map()
      });
    }
    
    const item = itemsMap.get(itemKey);
    
    // Add page reference
    if (row.page) {
      item.pages.add(row.page);
    }
    
    // Update item name if we have a description and current is default
    if (row.itemDescription && item.itemName === 'Imported Item') {
      item.itemName = row.itemDescription;
    }
    
    // Translate size
    const sizeResult = translateSizeToAISC(row.matSize);
    if (!sizeResult.matched) {
      const entry = unmatchedSizes.get(row.matSize) || { size: row.matSize, rowCount: 0, locations: [] };
      entry.rowCount += 1;
      const loc = `Item ${row.itemNumber}${row.partLabel ? ` (${row.partLabel})` : ''}`;
      if (!entry.locations.includes(loc)) entry.locations.push(loc);
      unmatchedSizes.set(row.matSize, entry);
    }
    
    // Create material key for aggregation
    const matKey = `${sizeResult.size}|${row.fabLength}|${row.partLabel || ''}`;
    
    if (!item.materialsMap.has(matKey)) {
      item.materialsMap.set(matKey, {
        description: row.partLabel || '',
        size: sizeResult.size,
        category: sizeResult.category,
        matched: sizeResult.matched,
        originalSize: row.matSize,
        length: row.fabLength,
        pieces: 0
      });
    }
    
    // Aggregate quantity
    item.materialsMap.get(matKey).pieces += row.qty;
  }
  
  // Convert to array structure
  const result = [];
  for (const [itemNumber, item] of itemsMap) {
    const materials = Array.from(item.materialsMap.values());
    result.push({
      itemNumber: item.itemNumber,
      itemName: item.itemName,
      drawingRef: Array.from(item.pages).sort((a, b) => parseInt(a) - parseInt(b)).join(', '),
      materials: materials
    });
  }
  
  // Sort by item number
  result.sort((a, b) => a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric: true }));
  
  return { items: result, unmatchedSizes: Array.from(unmatchedSizes.values()) };
};

// Get unique categories

export { parseRevuCSV, findColumnIndex, aggregateImportData };
