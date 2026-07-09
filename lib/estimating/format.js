// Rounding + display formatting. roundCustom (≤0.29 floors, >0.29 ceils)
// governs every displayed/exported weight and whole-dollar price.
// FINDINGS.md #7 (negative-value asymmetry) lives here, frozen as-is.

// Custom rounding rule: ≤0.29 rounds down, >0.29 rounds up
// Applied to weights (whole numbers) and prices (whole dollars)
const roundCustom = (num) => {
  if (num === null || num === undefined || isNaN(num)) return 0;
  const decimal = num - Math.floor(num);
  return decimal <= 0.29 ? Math.floor(num) : Math.ceil(num);
};

// Format weight with custom rounding (whole numbers)
const fmtWt = (num) => {
  return roundCustom(num).toLocaleString();
};

// Format price with custom rounding (whole dollars)
const fmtPrice = (num) => {
  return '$' + roundCustom(num).toLocaleString();
};

// Format rate with 2 decimal places (e.g., $1.25)
const fmtRate = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  return '$' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Format price for quotes with 2 decimal places (e.g., $1,234.00)
const fmtQuotePrice = (num) => {
  const rounded = roundCustom(num);
  return '$' + rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Supplier rates converted from CWT carry 4 decimals ($47.85/cwt → $0.4785/lb).
// Shows 2 places minimum, up to 4 when the rate needs them.
// (Moved verbatim from components/pdf/pdfUtils.js.)
const fmtRate4 = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  return '$' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
};

export { roundCustom, fmtWt, fmtPrice, fmtRate, fmtQuotePrice, fmtRate4 };
