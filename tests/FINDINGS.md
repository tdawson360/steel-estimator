# Characterization Findings (2026-07-08; extraction notes 2026-07-09)

> **Session B (calc-extraction) status**: all calculation logic now lives in
> `lib/estimating/` as pure functions; every finding below was preserved
> exactly and its new home is noted in the module's header comment. The
> duplicate implementations in #1 are now SINGLE functions
> (`lib/estimating/totals.js`, `lib/estimating/connection-pricing.js`) — the
> drift risk is closed. Finding #4 was evaluated for the permitted keyed-
> matching improvement: the characterization suite proved keyed matching is
> NOT output-identical (the frozen test asserts the positional cross-sum on
> order-shuffled input), so per the session rules it REMAINS POSITIONAL.
> Two additional identical-text duplicates found and collapsed during
> extraction: `normalizeShapeSize` and `parseCSVLine` (route copies vs
> component copies — byte-identical, merged without behavior change).

Suspected bugs and risky behaviors discovered while freezing today's numbers.
**Every one of these is asserted AS-IS in the test suite** — nothing was
changed in production code. Numbers below match `FINDING #n` comments in the
tests. Review each and decide: fix (then update the test), or bless as
intended behavior.

---

## #1 — Duplicated connection-cost logic in two files (drift risk, currently agree)

`getConnxCost` (app/api/import-csv/route.js, inside `enrichItemsWithPricing`)
and `connxCost` (lib/fab-pricing.js, inside `getFabPricingForSize`) implement
the same rule twice. Driven over a 9-row matrix (explicit costs, provide-T/O
flags, laborHours on row vs category, zero-dollar costs, fractional hours),
**they currently agree on every case** — the test in `connx-dual.test.js`
locks the agreement, so any future edit to one copy without the other fails
the suite. Same situation for two more duplicate pairs, also currently in
agreement and locked:
- `calculateItemTax` vs `getItemTaxBreakdown().taxAmount` (component, two tax implementations)
- `getItemTotal` (component) vs `getItemTotal` (components/pdf/pdfUtils.js)

**Risk**: not a wrong number today, but the classic source of one tomorrow.
The extraction should unify each pair.

## #2 — Moment connections price the same as standard connections on the laborHours path

When a beam/category has no explicit `momentConnxCost` and cost derives from
`laborHours × shopLaborRate`, the result is identical for moment and standard
connections — no moment premium. If moment connections genuinely cost more
labor, the data model can't express it on this path. (Both copies, same rule.)
Test: `connx-dual.test.js`.

## #3 — Quote base bid excludes tax while bidAmount includes it

`getItemTotal` (and therefore `calculateBreakoutTotals().baseBid` on the Quote
tab) contains no tax term. `calculateTotals().grandTotal` — which is saved as
`bidAmount` — includes tax. With F.O.B. or New Construction tax active, the
quote's base bid and the dashboard bid amount differ by the full tax amount.
Test: `tax-and-totals.test.js`.

## #4 — Import consolidation sums fab quantities POSITIONALLY

`consolidateMembers` merges members whose *sorted* fab signature matches, but
accumulates quantities by array index. Two members with the same ops in
different order merge cross-op: Drill(2)+Cut(1) → both become 3. Generation
order is deterministic today, which is why it works — but the invariant is
implicit. Test: `import-route.test.js`.

## #5 — Plate without dimensions silently prices at zero

`calculateMaterial` on a Plate line lacking `plateThickness`/`plateWidth`
yields wpf 0, weight 0, cost $0 with no error (the amber zero-weight banner is
the only defense). Test: `calculate-material.test.js`.

## #6 — Over-length pieces price at NET weight with no waste

`calculateOptimalStock` for a piece longer than every stock length returns
`waste: Infinity` and `stocksRequired = pieces`; `calculateMaterial` then takes
the `stockLen >= length` guard path: `stocksRequired 0`, `stockWeight =
fabWeight`, cost on net weight. A 62' W21x44 therefore carries **no waste and
no purchasable stick** in the standalone (non-nested) path — likely
underpricing spliced members. (The nesting path flags these as OVER LEN
instead.) Tests: `module-calcs.test.js`, `calculate-material.test.js`.

## #7 — roundCustom is asymmetric for negative values

The 0.29 rule computes the decimal via `num - floor(num)`, so −1.5 → −1 but
−1.8 → −2. Negative adjustments/credits displayed through `fmtPrice` round
differently than their positive counterparts. Test: `module-calcs.test.js`.

## #8 — Half-cent loss in laborHours-derived connection costs

`(1.333 × 65).toFixed(2)` → `86.64`, not `86.65` (IEEE representation of
86.645 is slightly below the midpoint). Sub-cent, but frozen so the extraction
can't "fix" it silently and shift totals. Test: `connx-dual.test.js`.

## #9 — Persistence loses engine inputs: plate dims, custom weight, fab-line length (found 2026-07-09)

Three engine inputs have no DB column and do not survive a save → load
round-trip:

- **`plateThickness` / `plateWidth`** — the Material table has `thickness`/
  `width` columns, but they are only mirrored at material creation (not on
  edit) and the loader never maps them back to `plateThickness`/`plateWidth`.
  `calculateMaterial` derives plate weight ONLY from those fields, so a
  dimensioned plate reloads as dimensionless and re-prices at $0 (the reload
  manifestation of #5).
- **`customWeight`** — no column at all; a Custom line reloads with
  weightPerFoot 0 and re-prices at $0.
- **MaterialFabrication `length`** — ~~no column~~ **FIXED 2026-08-27** with
  the labor-groups migration (`add_labor_groups`): `length`, `galvanized`,
  `galvWeight`, and `applyTo` now have columns on MaterialFabrication and
  ChildMaterialFabrication, are written by the PUT and duplicate routes, and
  are mapped by both mirrored normalizers (client loader + `dbFabToEngine`).
  An IN/LF length-based fab line now round-trips exactly — pinned in
  `api-server-authority.test.js` ("FINDINGS #9 fix").

Still open: the two material-level inputs above (`plateThickness`/`plateWidth`
mapping and `customWeight`). Consequence for the server-authority regime:
recompute of a payload (PUT) has full fidelity, but recompute of a SAVED tree
(duplicate route, or any save after a reload) sees only the persisted inputs.
The API characterization test (`api-server-authority.test.js`) pins both: the
duplicate of a project with these lossy lines matches the engine over the DB
tree, and a round-trip-stable project duplicates with zero drift. Adjudication
of the remaining two fields is deferred — behavior frozen as-is.

---

## Behavior notes (not bugs, but worth blessing explicitly)

- **The Estimate tab's per-item "Total Item Cost" panel excludes recap costs**
  (it shows `mat×(1+muMat) + fab×(1+muFab)` only), while `getItemTotal` — used
  by the Quote tab's base bid — includes recap. Three "total" notions now
  coexist: panel total (no recap, no tax), getItemTotal (recap, no tax — #3),
  grandTotal/bidAmount (recap + tax). Preserved as-is during extraction
  (noted 2026-07-09; the panel now consumes `getItemCostBreakdown`).

- **LF pricing pays for full purchased sticks** (`stocksRequired × stockLength × $/ft`),
  not net footage — consistent with LB pricing on purchased weight. EA pricing
  ignores stock entirely (`pieces × $/ea`).
- **roundCustom (≤0.29 floors, >0.29 ceils)** governs every displayed/export
  weight and whole-dollar price; CSV/PDF totals inherit it.
- **`mergeFabOps` dedupes cut/weld ops** when the same member mark spans
  multiple rows (accumulates only drills/connections) — correct for one
  physical member split across rows, but means a cut listed on two rows of the
  same mark counts once.

## Inventory paths NOT under test (called out per Step 4)

- **Pooled-overlay totalCost effect** (SteelEstimator.jsx useEffect ~5445):
  the per-priceBy pooled cost formula lives inline in a React effect. Its
  allocation inputs are fully tested via `computeProjectNest`, and the same
  formula shape is tested in `calculateMaterial`/`buildStockListExport`, but
  the effect body itself is not executed by this suite.
- **RFQ vendor CSV upload** (`handleRfqPricingUpload`): FileReader-bound;
  weighted-average-by-size pricing application is untested.
- **`sizePricing` memo / `applySizePrice`**: inline memo/setter; the derived
  rate rules are exercised only indirectly through `buildStockListExport`.
- **`addMaterialFab` default row** (qty 1 × fetched rate): trivial, untested.
- **Prisma row selection** in `getFabPricingForSize`/`enrichItemsWithPricing`
  (exact-beam vs category-prefix fallback): the *lookup* is I/O and untested;
  the *cost math* it feeds is fully tested.
