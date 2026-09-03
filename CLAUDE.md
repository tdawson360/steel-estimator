# Steel Estimator — Project Context

**Company:** Berger Iron Works (Houston, TX) — structural steel fabrication and ornamental metals
**Owner:** Todd Dawson (admin). Lead estimator: Samantha Neil.

Internal web app for steel estimating: Bluebeam takeoffs import as structured CSV, the app builds material + labor estimates with real pricing, and projects move through a draft → review → publish workflow on the bid board.

---

## Tech Stack & Running

- Next.js 14 (App Router) + React, JavaScript (not TS)
- Prisma + SQLite (`prisma/dev.db`) — **this is real company data**, not test data. Daily noon backup task mirrors verified snapshots to OneDrive (`scripts/backup-db.mjs`).
- NextAuth credentials login; roles: ADMIN, ESTIMATOR, PM, FIELD_SHOP
- Tests: `npx vitest run` (characterization suite — keep it green; run before committing)

```bash
npm run dev            # dev server on :5000
npm run build && npm start   # production build — preferred for real estimating sessions (dev mode is slow on large estimates)
```

Server binds 0.0.0.0:5000 so office-LAN users can reach it. Deployment to an office server is planned; until then it runs on Todd's machine.

**Branches:** `main` is canonical. Work happens on `calc-extraction`; pushes fast-forward both (`git push origin calc-extraction && git push origin calc-extraction:main`).

---

## Architecture Map

- `components/SteelEstimator.jsx` — the estimator UI (large single component). **Careful renaming top-level `const` declarations**: the test harness (`tests/helpers/extract.js`) slices function source out of this file by marker text.
- `lib/estimating/*` — the pure calculation engine (material calc, fab costs, totals, nesting, labor groups, galv rules, connection pricing, importers). No React/Prisma in these modules.
- `lib/estimating/recompute.js` + `lib/recompute-server.js` — server-authoritative totals: every PUT re-runs the engine and persists the SERVER's numbers; client/server drift is logged (`mismatch.log`). **Any pricing-rule change must land in both the UI path and the engine**, or drift alarms fire.
- `app/api/projects/[id]/route.js` — GET/PUT with differential updates; materials are a **flat array with `parentMaterialId`** linking subparts to parents.
- `app/admin/connection-pricing/` — the **Global Pricing Data** page: rate drivers, operation rates, custom ops, connection categories (WF + C/MC), Connx Template sync.
- `app/dashboard/` — bid board (projects, statuses, archive; templates listed separately).

---

## Takeoff Pipeline (Bluebeam)

Takeoffs are done in-house with Bluebeam Revu; Todd shares the profile/toolkit with whoever is helping.

- Canonical files (repo root): `Steel_Estimator_Takeoff_v1.7.bpx` (profile: 23 custom columns, choice lists, Allow Custom Text on the op columns + Shape_Size) and `BIW_Steel_Tool_Kit_v1.7.btx` (22 measurement tools, clean presets).
- **Version the internal names** when shipping new files (profile `Name`, toolkit `Title`) — Revu will not replace a loaded same-named profile/tool set, and hand-edited column XML is ignored on import. The reliable loop: fix columns in Revu's UI → export → that export is the new canonical bpx.
- Markups list → CSV export → **Import CSV** in the app (`/api/import-csv`, logic in `lib/estimating/import-takeoff.js`).

### CSV contract (essentials)

One row = one piece. Grouped by `Item_Number`; `Member_Mark` parent/child dotting ("45", "45.1") nests subparts under members. `Length_Ft` (typed) OR `Measured_Length` (measured) suffices; drawn dimension strings are parsed and reconciled to the nearest inch. `Page_Label` and `Drawing_Ref` merge into the item's Dwg Ref.

Dropdown → operation mappings (see `import-takeoff.js` maps; `None` imports as blank everywhere):

- **End_1/End_2**: Straight/Miter/Double Miter/Single Cope/Double Cope/Profile, plus compounds ("Single Cope + Miter" splits into two ops)
- **Holes** + `Hole_Qty`: Drill / Drill & C'sink / Drill & Tap / Drill Thru
- **Weld_Type**: Fillet / Bevel\/Grind / PJP / CJP
- **Connection_Type** + `Connection_Qty`: `WF Bolted`, `WF Welded`, `WF CJP`, `C Bolted`, `C Welded`, `C CJP`, `Loose` (legacy `WF/C Connx` and `Moment Connx` still accepted; CJP maps to Moment pricing)
- **Prep_Ops**: Ease / Splice / 90's / Camber / Roll
- **Coating**: aggregates at ITEM level when uniform across rows; mixed values are flagged
- **Galvanized**: Yes → galv weight lines (see galv rules below)

Unmapped op values are silently dropped — keep takeoff values on the list.

---

## Estimating Model — Key Rules

- **Hierarchy**: Item → materials (flat, `parentMaterialId` for subparts) → per-material fab ops; plus item-level General Fab and Recap costs.
- **Coatings, finishes, handling are item-scope**: they exist only on the General Fab tab, never on material rows (legacy rows render under a "Legacy" group).
- **Cutting ops default to the member's piece count** when added; subpart piece counts inherit from the parent until edited.
- **Labor groups**: fab rows on parents of the **same exact size** sharing an operation price once at a group rate (`lib/estimating/labor-groups.js`; `sizeKeyForSize` — the shape family only orders the display); assembly galv lines group by rate class. New groups start collapsed (one summary line; members show an "N grouped" tag) and collapsed groups print as a single line. Children and connection-galv lines never group.
- **Galvanizing = one dipped assembly, one line, one rate** (`lib/estimating/galv.js`): a galvanized parent's auto-galv line carries its own weight + galvanized subparts + galvanized connection weights; covered subparts/conn-ops get no separate lines. Each assembly carries a **galvanizer rate class** (`lib/estimating/galv-classes.js`: KDS structural, MSC misc, pipe/tube tiers, MLT under 20 lb) defaulted from its main member and editable on the line; class rates (all-in $/cwt) live on Global Pricing Data → Galvanizing, seeded from AZZ's sheet (`docs/galv-rate-sheet.pdf`). Galv lines group by class (`familyKey` = class code) like other labor groups. Projects under the galvanizer minimum (`PricingRates.galvMinimumCharge`, $325) get a Summary-tab banner with a one-click shortfall adjustment. `normalizeGalvLines` is the single reconciler — call it after any mutation that touches materials/fabs.
- **Connection pricing**: per-each by depth category on Global Pricing Data. `Bolted $` / `Welded $` are all-in prices synced from the **Connx Template** project (each linked template item = one connection taken off line by line; its shop total is the price). Sync is snapshot-based with preview; applying reprices DRAFT/REOPENED estimates (IN_REVIEW opt-in, PUBLISHED never). `Moment/CJP $` and cut costs work as before.
- **Template projects** (`Project.isTemplate`): editable only by admins + the assigned estimator; never publish/review; can't be deleted while pricing cells link to their items; listed under "Templates" on the dashboard, not the bid board.
- **Hardware category**: free-text description (e.g. `3/4" A325 x 2"`), priced per-each — used for bolts in the Connx Template.
- **Concurrency** (`lib/project-lock.js`, `lib/project-access.js`): opening an estimate with edit rights claims a **soft edit lock** (`POST /api/projects/[id]/lock`: claim/heartbeat/takeover/release; heartbeat every 60 s, stale after 3 min, released by a `pagehide` beacon). Another editor opens read-only with a "X is editing" banner and a **Take over** button (anyone with edit rights; reloads to the latest copy). Every PUT sends `expectedVersion` (`Project.version`, bumped by each save and by Connx Template sync repricing); a mismatch or a live lock held by someone else is a **409** with `conflict {kind: version|locked, by, at}` — the estimator stashes the work locally and offers **Reload** (discard) or **Overwrite** (`force: true`, retakes the lock). A successful save always makes the saver the lock holder. The bid board shows an "editing: Name" pill on live locks.
- **Statuses**: DRAFT → IN_REVIEW → PUBLISHED (+ REOPENED). PUBLISHED is the frozen record of what was quoted. Archived projects can be permanently deleted by admins (archive-first is enforced server-side).

---

## Conventions

- Never commit `.next/` or `prisma/dev.db`.
- Money math discrepancies: check `mismatch.log` ([TOTALS-MISMATCH]) before assuming the client is right — the server recompute is authoritative.
- Schema changes: `npx prisma migrate dev` (stop the running server first — it locks the query engine DLL on Windows).

*Last updated: September 2026*
