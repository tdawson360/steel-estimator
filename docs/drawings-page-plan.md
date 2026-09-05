# Drawings page — plan (scoped 2026-09-04, not built)

Drop a bid set into the estimator app, scope it, and (if Sam says chase) measure it.
The Python sidecar (`sidecar/`) does the work; the app gives it a home: uploads, a job
queue, a prospects list, per-project drawing files, and history. Todd's rules:

- A project is created only when scope results are promising and Sam decides to chase.
- No autofill of the Project Info page. Creating a project from a prospect sets the
  project name and links the drawing set; every other field starts blank.
- Bluebeam Revu stays the review surface. Outputs are Revu-readable PDFs.

## What the user sees

**/drawings** (ADMIN, ESTIMATOR)

1. Drop zone: one combined set (all disciplines, as received). Big files are normal
   (Moody is 375 MB); upload streams to disk on the LAN.
2. Scope runs automatically after upload. Card per set in the **Prospects** list:
   name, uploaded by/when, status chip (Scoping… / Scoped / Failed), and the summary:
   structural plans found, shape callouts by size with a rough plan tonnage, misc items
   found (stairs, rails, canopies, counter supports, lintels…), finish/grade notes,
   document status (progress set / IFB / permit). Buttons: **Open scope PDF** (Revu),
   **Measure**, **Chase**, **Pass**.
3. **Chase** asks for a project name (prefilled from the set's title-block project name,
   editable) and creates a DRAFT project with only that name, links the set to it, and
   opens the estimate. Nothing else on Project Info is touched.
4. **Pass** hides the set from Prospects (kept, with who/when, for the record).

**Project → Drawings tab** (anyone who can view the project; run/upload for editors)

- The set(s) linked to the project, each with its jobs: kind, when, by whom, status,
  outputs (AUTO pdf, report, hits csv, scope pdf) as download links, and the log.
- **Measure** (with options: lengths on/off, OCR auto/off, sheets filter) and
  **Re-scope**.
- **Upload markup copy**: Sam's MARKUPS_ pdf after her takeoff. Stored next to the set;
  this is the benchmark/training feed (`sidecar/benchmark.py` reads exactly this layout).

**Dashboard**: a "Prospects (n)" link next to the bid board; bid-board rows show a small
drawings icon when a set is attached.

## Data model (Prisma)

```
model DrawingSet {
  id            Int      @id @default(autoincrement())
  name          String                     // display name (filename stem; editable)
  originalName  String
  storagePath   String                     // relative to DRAWINGS_DIR: "<id>/original.pdf"
  markupPath    String?                    // "<id>/markup.pdf" once Sam uploads hers
  sizeBytes     Int
  pageCount     Int      @default(0)
  sha256        String?                    // duplicate-upload detection
  titleBlock    String   @default("{}")    // JSON: project name/address/engineer/architect read from the set (display only)
  prospectStatus String  @default("NEW")   // NEW | SCOPED | CHASE | PASS
  passedById    Int?     passedAt DateTime?
  projectId     Int?     project Project? @relation(...)
  uploadedById  Int      uploadedBy User @relation(...)
  createdAt     DateTime @default(now())
  jobs          DrawingJob[]
}

model DrawingJob {
  id          Int      @id @default(autoincrement())
  setId       Int      set DrawingSet @relation(...)
  kind        String                       // SCOPE | MEASURE
  status      String   @default("QUEUED")  // QUEUED | RUNNING | DONE | FAILED | CANCELLED
  options     String   @default("{}")      // JSON: {lengths, ocr, sheets}
  progress    String   @default("")        // last progress line from the sidecar
  summary     String   @default("{}")      // JSON written by the sidecar (--json)
  outputs     String   @default("[]")      // JSON: [{name, path, bytes}]
  log         String   @default("")        // tail of stdout/stderr (cap 64 KB)
  requestedById Int
  createdAt   DateTime @default(now())
  startedAt   DateTime?
  finishedAt  DateTime?
}
```

`Project` gains `drawingSets DrawingSet[]`. Migration only adds tables and one relation.

## Storage

- `DRAWINGS_DIR` env, default `C:\Projects\steel-estimator-drawings` (outside the repo;
  client data, never committed). Layout: `<setId>/original.pdf`, `<setId>/markup.pdf`,
  `<setId>/jobs/<jobId>/<outputs>`.
- Backup: originals and markups are irreplaceable, outputs are regenerable. Extend
  `scripts/backup-db.mjs` (noon task) to mirror `original.pdf` + `markup.pdf` to the
  OneDrive folder; outputs are not mirrored. Retention: keep everything for now; add a
  "delete outputs older than N days" admin action later if disk matters.
- Upload route streams `request.body` to a temp file, then renames into place; it never
  buffers the PDF in memory. Duplicate detection by sha256 (warn, allow).

## Job runner (`lib/drawings/runner.js`)

- One in-process worker in the Next.js server (concurrency 1: the sidecar is CPU-bound
  and this machine is also Todd's estimating PC). Started lazily on the first job
  request and on server boot (`instrumentation.js`), which also re-queues any job left
  RUNNING by a crash.
- Spawns `SIDECAR_PYTHON` (default `python`) with `sidecar/scope.py` or
  `sidecar/auto_takeoff.py`, `cwd` = repo root, below-normal priority on Windows
  (`start /belownormal` or `os.setPriority` on the child). Stdout/stderr stream into
  `DrawingJob.log` (tail-capped); lines starting `PROGRESS ` update `progress`.
- On exit 0: reads the sidecar's `--json` summary, lists output files, marks DONE, and
  for SCOPE jobs flips `prospectStatus` NEW → SCOPED. Non-zero: FAILED with the log.
- Cancel: kill the child; mark CANCELLED.
- Health: `GET /api/drawings/health` runs `python -c "import pymupdf"` and reports
  versions, so a missing Python shows up on the page instead of as a failed job.

## Sidecar changes (small)

- Both CLIs accept `--json <path>` and write a machine summary (sheets, counts, sizes,
  LF, misc categories, notes, exceptions) — the same numbers the markdown report shows.
- Both print `PROGRESS <i>/<n> <sheet>` per sheet.
- `scope.py` writes the Revu-boxed scope PDF (Todd's requirement; today it writes
  markdown only): one box per matched line, subject = category, Notes = matched text;
  vocabulary trimmed to the high-level items Todd listed; aluminum/stainless/bronze move
  from "exclude" to "material" (they are Berger scope).
- Exit codes: 0 done, 2 bad input (not a PDF / no pages), 3 dependency missing.

## API

| Route | Who | Does |
|---|---|---|
| `POST /api/drawings` | ADMIN, ESTIMATOR | stream upload → DrawingSet, enqueue SCOPE |
| `GET /api/drawings?prospects=1` / `?projectId=` | viewers of the project; prospects: ADMIN, ESTIMATOR | list sets + latest job |
| `GET /api/drawings/[id]` | as above | set, jobs, outputs |
| `POST /api/drawings/[id]/jobs` `{kind, options}` | ADMIN, ESTIMATOR | enqueue MEASURE or SCOPE |
| `GET /api/drawings/[id]/jobs/[jobId]` | as above | status, progress, log tail (polled every 3 s while RUNNING) |
| `DELETE /api/drawings/[id]/jobs/[jobId]` | requester or ADMIN | cancel |
| `GET /api/drawings/[id]/files/[name]` | as above | download (Content-Disposition; no directory traversal) |
| `POST /api/drawings/[id]/chase` `{projectName}` | ADMIN, ESTIMATOR | create DRAFT project (name only, handlingEnabled on), link set, prospectStatus CHASE |
| `POST /api/drawings/[id]/pass` | ADMIN, ESTIMATOR | prospectStatus PASS |
| `POST /api/drawings/[id]/markup` | ADMIN, ESTIMATOR | stream upload of MARKUPS_ pdf |
| `GET /api/drawings/health` | signed in | python/pymupdf/opencv/rapidocr presence |

All routes go through `getServerSession`; project-scoped reads use `lib/project-access.js`.
Project creation via chase must set `Project.version` like the normal POST does.

## UI work

- `app/drawings/page.js`: drop zone (drag/drop + file picker, progress bar via
  XMLHttpRequest upload events), Prospects table, per-row summary drawer.
- `app/drawings/[id]/page.js`: set detail — summary card, sheet table (from the JSON),
  jobs with live status, outputs, markup upload, Chase/Pass.
- Estimator: a "Drawings" tab next to Project Info listing the project's sets (reuses
  the detail components). Bid board: prospects link + drawings icon.
- Dark-mode conventions per the memory note (zinc, translucent tints, sky accents).

## Tests

- Runner state machine with a fake child process (queue → running → done/failed/cancelled;
  crash re-queue).
- Upload route: streaming to disk, size and type checks, sha256, auth.
- Chase: creates a DRAFT project with only the name set, links the set, bumps version.
- Sidecar `--json` shape is a fixture the app tests read (keeps the contract honest).

## Phases

1. **Scope in the app** — migration, storage, upload, runner, SCOPE job, Prospects list,
   detail page, Pass. Scope PDF boxes + `--json` in the sidecar. Health check.
   (Roughly a week.)
2. **Chase and Measure** — chase flow, project Drawings tab, MEASURE job with options,
   markup upload, bid-board indicators. (Roughly a week.)
3. **Operate** — backup mirror, retention action, cancel, admin settings (Python path,
   OCR default), benchmark button on a set that has a markup copy.

## Risks and decisions

- **CPU on Todd's PC** until the office server exists: concurrency 1 and below-normal
  priority; a Moody-size scope is ~3 min, OCR sheets ~3.5 min each. Fine on the LAN.
- **Python on the server**: install once with `sidecar/requirements.txt`; the health
  check makes a broken install obvious. Document in CLAUDE.md.
- **Disk**: sets are 30–375 MB; a year of bids is tens of GB. Outputs are regenerable.
- **Not in scope**: Bluebeam plugin, CSV import changes, any Project Info autofill,
  editing markups in the browser.

Open for Todd: (1) should Measure run automatically after Chase, or stay a button;
(2) can PM/FIELD_SHOP download the AUTO pdf on published projects (default: yes, read-only);
(3) prospect naming — filename stem vs title-block project name (default: title block when
readable, else filename).
