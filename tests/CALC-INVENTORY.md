# Calculation-Path Inventory (characterization baseline, 2026-07-08)

Every function that computes money, weight, hours, or quantities. "Scope" says
how the test suite reaches it: `module` = sliced from module scope of the file,
`component` = sliced from inside the React component with injected closure
stubs, `import` = plain ES import.

## components/SteelEstimator.jsx

| # | Function (line) | Scope | Inputs → Outputs | Called from |
|---|---|---|---|---|
| 1 | `roundCustom` (1648) | module | number → integer (≤.29 floor, >.29 ceil) | all fmt*, exports, weights/prices display |
| 2 | `fmtPrice/fmtWt/fmtRate/fmtQuotePrice` | module | number → display string | UI, CSV/PDF exports |
| 3 | `calcPlateWeightPerFoot` (1607) | module | thickness(in), width(in) → lb/ft | calculateMaterial (Plate) |
| 4 | `steelDatabase` weights | module | size key → { weight lb/ft, category } | calculateMaterial, imports |
| 5 | `getStockLengthsForCategory` + length tables | module | category → ft[] | optimal stock, nest, dropdowns |
| 6 | `calculateOptimalStock` (1677) | module | pieces, length, lengths[] → { optimalLength, stocksRequired, waste, efficiency, piecesPerStock } | calculateMaterial |
| 7 | `isNestableMaterial` (1729) | module | material → bool | computeProjectNest |
| 8 | `nestCutsFFD` (1745) | module | cuts[], lengths[], kerfFt, endCropFt, caps → { sticks, overLength, shortfall } | computeProjectNest |
| 9 | `computeProjectNest` (1851) | module | items, kerf, crop, getLengths, getCaps → { groups(yield/buy/net), byMaterial(alloc), tooManyPieces } | projectNest memo → pooled stockWeight/totalCost |
| 10 | `compressGroupSticks` (module) | module | group → cut-ticket rows (counts, drops) | Stock List UI, Cut Detail PDF |
| 11 | `toAlphaSeq/toChildAlphaSuffix/parse*` | module | n ↔ letter seq | resequencing (quantity-adjacent identifiers) |
| 12 | `normalizeShapeSize`, `translateSizeToAISC` | module | size string → { size, category, plate dims, matched } | imports (drives weight lookup) |
| 13 | `parseCSVLine/findColumnIndex/parseRevuCSV` (2100+) | module | CSV text → rows (qty, fabLength w/ 1" rounding) | legacy import |
| 14 | `aggregateImportData` (2295) | module | rows → items (qty summed by size+length+desc) | legacy import |
| 15 | `wf/cConnectionWeights` maps + `getConnectionWeight` (1524) | module | size, category → conn lb | updateMaterialFab fallback |
| 16 | `OP_PRICING_FIELD/OP_WEIGHT_FIELD/OP_DEFAULT_UNIT`, `CONNECTION_WEIGHT_OPS` | module | op name → pricing/weight field | fab pricing application |
| 17 | `calculateItemTax` (2565) | component (deps: taxCategory, TAX_RATE=0.0825) | item → tax $ (newConstruction: (mat+matMU)×rate; fob: (mat+matMU+fab+fabMU)×rate; resale/noTax/none: 0) | calculateTotals |
| 18 | `getItemTaxBreakdown` (2586) | component | item → { taxableBase, taxAmount, components } — **duplicate of #17's math** | Recap tab UI |
| 19 | `getItemTotal` (3707) | component | item → markedUpMat + markedUpFab + recap (**no tax**) | breakout totals, Quote |
| 20 | `calculateBreakoutTotals` (3725) | component (deps: items, breakoutGroups, adjustments, getItemTotal) | → { baseBid (incl. deducts + adjustments, excl. adds, **excl. tax**), deducts[], adds[] } | Quote tab |
| 21 | `calculateMaterial` (3835) | component (deps: module fns + availableLengthsFor) | material → wpf, fabWeight, stock pick, stocksRequired, stockWeight, waste, efficiency, totalCost (LB/CWT/LF/EA) | every material edit, imports, load |
| 22 | `calculateTotals` (5388) | component (deps: items, adjustments, calculateItemTax, CONNECTION_WEIGHT_OPS) | → totals incl. markups, recap, tax, connection weight, adjustments, grandTotal (**= bidAmount on save**) | summary, save payload |
| 23 | Pooled-overlay totalCost (useEffect ~5445) | component (inline effect) | alloc × priceBy → pooled stockWeight/totalCost | nesting write-back — **covered indirectly** (see findings) |
| 24 | `addMaterialFab` (4956) | component | defaults: qty 1 × fetched rate | UI |
| 25 | `updateMaterialFab` (5005) | component (deps: getPricingForSize stub, OP maps, getConnectionWeight, customOpRateMap) | fab edit → totalCost rules: conn+LB: qty×connWeight×rate; IN/LF+length: qty×len×rate; else qty×rate; conn galvWeight = qty×connWeight | material fab rows |
| 26 | `updateFabrication` (5169) | component | qty × unitPrice | item-level fab rows |
| 27 | `updateRecapCost` (5248) | component | cost+markup%: total = cost×(1+mu/100); PM: hours×rate | Recap tab |
| 28 | `updateMaterial` galv auto-line (~4155) | component | galv fab quantity = fabWeight | Galv checkbox / edits |
| 29 | `buildStockListExport` (~2790) | component (deps: displayedStockList, sizePricing, projectNest, stockListFilter) | rows + estCost (LB/CWT/LF) + totals + shortfalls | CSV/PDF buy list |
| 30 | RFQ vendor upload weighted-average by size (handleRfqPricingUpload) | component (FileReader-bound) | vendor CSV → per-size priceBy/unitPrice | **NOT under test — called out in report** |
| 31 | `sizePricing` memo / `applySizePrice` | component (inline memo) | lines → per-size uniform rate/mixed | **NOT under test directly** (formula asserted via buildStockListExport) |

## components/pdf/pdfUtils.js (plain imports)

| # | Function | Notes |
|---|---|---|
| 32 | `roundCustom`, `fmtPrice/fmtRate/fmtQuotePrice` | duplicate of #1/#2 |
| 33 | `fmtRate4` | 2–4 decimal rates (CWT) |
| 34 | `getItemTotal` | **duplicate of #19** — compared head-to-head |
| 35 | `getItemCostBreakdown` | material/fab/markup/recap split |

## app/api/import-csv/route.js (sliced; prisma/next excluded)

| # | Function | Notes |
|---|---|---|
| 36 | `parseFeetInches` | drawn-dimension strings → decimal ft |
| 37 | `parseTakeoffCSV` | qty default (blank→1), drawn-dim preference within 2", nearest-inch rounding, 2-dec storage |
| 38 | `generateEndLabor` / `generateRowFabOps` | labor op quantities incl. compound " + " split |
| 39 | `mergeFabOps` | accumulate drill/connection quantities, dedupe cuts/welds |
| 40 | `memberFingerprint` / `consolidateMembers` | piece summing + positional fab-qty accumulation + child pooling |
| 41 | `aggregateTakeoffData` | memberKey = mark+size+length; coating aggregation |
| 42 | `normalizeToBeamSizeKey` / `getShapeTypeFromKey` | size → pricing key |
| 43 | `getConnxCost` (inside enrichItemsWithPricing) | **copy A** of connection-cost rule |
| 44 | `enrichOp` (inside enrichItemsWithPricing) | op → rate/connWeight from pricing row + global rates |

## lib/fab-pricing.js (sliced; prisma excluded)

| # | Function | Notes |
|---|---|---|
| 45 | `normalizeKey` / `getShapeType` | size → pricing key (compare vs #42) |
| 46 | `connxCost` (inside getFabPricingForSize) | **copy B** of connection-cost rule — dual-tested vs #43 |

## lib/estimating/labor-groups.js (plain imports — added 2026-08-27)

| # | Function | Notes |
|---|---|---|
| 47 | `familyKeyForSize` | shape family key (W12, HSS 4x4, L 3x3…); Plate/Flats/Custom → null (ungroupable) — `labor-groups.test.js` |
| 48 | `applyGroupRates` | stamps group rate onto member fab rows before `computeFabLineTotal`; hooked into `recomputeEstimate` (order-preserving — index alignment) |
| 49 | `computeGroupSummaries` | group line: totalQty = Σ member qty, totalCost = Σ member line totals (NOT count × rate — connection/length rows use their per-row formulas) |
| 50 | `buildAutoGroups` | import/manual grouping: join-existing precedence, min-2 rule, uniform-rate prefill vs mixed→0 |
| 51 | `sortMaterialsByFamily` / `familyBlocks` / `groupAnchors` | family-block ordering + group-line placement (display concern, still pinned) |

Grouped-pricing end-to-end: `e2e-golden.test.js` ("labor-grouped fixture"),
API persistence round-trip: `api-server-authority.test.js` ("labor groups"),
reconcile identity: `reconcile.test.js` ("with labor groups").

## Server-side other

- `handleSave`: `bidAmount = totals.grandTotal` — covered by #22 e2e.
- Prisma-bound query plumbing (getFabPricingForSize row selection, enrichItemsWithPricing batch fetch) is I/O, not math — the pure cost rules extracted above are what's frozen.
