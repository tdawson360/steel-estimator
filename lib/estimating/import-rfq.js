// RFQ vendor-pricing CSV: parse the returned quote sheet, build exact
// (size + stock length) and size-level weighted-average pricing, and match it
// against estimate materials. Unit priority: $/CWT, $/LB, $/LF, $/EA.

import { normalizeShapeSize } from './sizes';

// text → { error } | { pricingMap, bySize }
//  - pricingMap: "normalizedSize-stockLength" -> { priceBy, unitPrice }
//  - bySize:     normalizedSize -> weight-weighted average across that
//                size's rows. Nested lines carry their own standalone
//                stock length while the buy list shows pooled stick
//                lengths, so size-level pricing is the fallback that makes
//                vendor uploads land on pooled lines.
export function parseVendorPricingCsv(text) {
  const lines = text.split(/\r?\n/);

  // Find the data header row (first column = "Size", case-insensitive)
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].split(',')[0].trim().toLowerCase() === 'size') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return { error: 'Could not find data rows. Make sure this is an RFQ CSV exported from this app.' };
  }

  const headers = lines[headerIdx].split(',').map(h => h.trim().toLowerCase());
  const sizeIdx      = headers.indexOf('size');
  const stockLenIdx  = headers.indexOf('stock length');
  const perCwtIdx    = headers.findIndex(h => h.includes('$/cwt'));
  const perLbIdx     = headers.findIndex(h => h.includes('$/lb'));
  const perLfIdx     = headers.findIndex(h => h.includes('$/lf'));
  const perEaIdx     = headers.findIndex(h => h.includes('$/ea'));

  const qtyIdx  = headers.indexOf('quantity');
  const wtFtIdx = headers.findIndex(h => h.includes('weight/ft'));

  const pricingMap = new Map();
  const sizeAgg = new Map();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const size = cols[sizeIdx];
    if (!size || size.toLowerCase().startsWith('total')) break;

    const stockLen = parseFloat(cols[stockLenIdx]) || 0;
    const perCwt   = perCwtIdx !== -1 ? parseFloat(cols[perCwtIdx]) : NaN;
    const perLb    = parseFloat(cols[perLbIdx]);
    const perLf    = parseFloat(cols[perLfIdx]);
    const perEa    = parseFloat(cols[perEaIdx]);

    let rowPricing = null;
    if (!isNaN(perCwt) && perCwt > 0)    rowPricing = { priceBy: 'CWT', unitPrice: perCwt };
    else if (!isNaN(perLb) && perLb > 0) rowPricing = { priceBy: 'LB', unitPrice: perLb };
    else if (!isNaN(perLf) && perLf > 0) rowPricing = { priceBy: 'LF', unitPrice: perLf };
    else if (!isNaN(perEa) && perEa > 0) rowPricing = { priceBy: 'EA', unitPrice: perEa };
    if (!rowPricing) continue;

    const normSize = normalizeShapeSize(size);
    pricingMap.set(`${normSize}-${stockLen}`, rowPricing);

    const rowWeight = (parseFloat(cols[qtyIdx]) || 1) * (stockLen || 1) * (parseFloat(cols[wtFtIdx]) || 1);
    const agg = sizeAgg.get(normSize);
    if (!agg) {
      sizeAgg.set(normSize, { priceBy: rowPricing.priceBy, num: rowPricing.unitPrice * rowWeight, den: rowWeight });
    } else if (agg.priceBy === rowPricing.priceBy) {
      agg.num += rowPricing.unitPrice * rowWeight;
      agg.den += rowWeight;
    }
  }
  const bySize = new Map();
  sizeAgg.forEach((agg, s) => bySize.set(s, { priceBy: agg.priceBy, unitPrice: agg.num / (agg.den || 1) }));

  if (pricingMap.size === 0) {
    return { error: 'No pricing found. Make sure the vendor filled in the $/LB or $/LF columns.' };
  }

  return { pricingMap, bySize };
}

// Pricing for one material: exact size+stockLength match first, then the
// size-level weighted average, else null.
export function vendorPricingFor(mat, pricingMap, bySize) {
  const normSize = normalizeShapeSize(mat.size);
  return pricingMap.get(`${normSize}-${mat.stockLength}`) || bySize.get(normSize) || null;
}

// Determine which vendor rows actually match materials in the estimate
export function matchVendorPricing(items, pricingMap, bySize) {
  const matchedKeys = new Set();
  items.forEach(item => {
    item.materials.forEach(mat => {
      const normSize = normalizeShapeSize(mat.size);
      const exactKey = `${normSize}-${mat.stockLength}`;
      if (pricingMap.has(exactKey)) {
        matchedKeys.add(exactKey);
      } else if (bySize.has(normSize)) {
        // size-only fallback: mark every vendor row of this size as used
        pricingMap.forEach((_, key) => {
          if (key.startsWith(`${normSize}-`)) matchedKeys.add(key);
        });
      }
    });
  });

  const unmatchedSizes = [];
  pricingMap.forEach((_, key) => {
    if (!matchedKeys.has(key)) unmatchedSizes.push(key.split('-')[0]);
  });

  return { matchedKeys, unmatchedSizes };
}
