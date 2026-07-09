// Supplier stock-length availability resolution — THE shared input path for
// client and server. `overrides` is Project.stockLengthOverrides (parsed):
// size → { lengths: [...], caps: { len: maxSticks } } (or a legacy plain
// array of lengths). Both the component and the server-side recompute resolve
// purchasable lengths through these functions so their engine inputs are
// identical by construction.

import { getStockLengthsForCategory } from './stock-lengths';

export const normalizeLengthOverride = (o) => {
  if (Array.isArray(o)) return { lengths: o, caps: {} };
  if (o && typeof o === 'object') {
    return {
      lengths: Array.isArray(o.lengths) ? o.lengths : [],
      caps: (o.caps && typeof o.caps === 'object') ? o.caps : {},
    };
  }
  return null;
};

export const availableLengthsForOverrides = (overrides, category, size) => {
  const o = size ? normalizeLengthOverride((overrides || {})[size]) : null;
  if (o && o.lengths.length > 0) return [...o.lengths].sort((a, b) => a - b);
  return getStockLengthsForCategory(category);
};

// Max sticks the supplier can supply, per length (absent = unlimited)
export const lengthCapsForOverrides = (overrides, category, size) => {
  const o = size ? normalizeLengthOverride((overrides || {})[size]) : null;
  return o ? o.caps : {};
};
