# Steel Estimator — Developer Handoff
**Berger Iron Works | Houston, TX**
*Last Updated: February 2026*

---

## Project Overview

A web-based steel fabrication estimating tool used internally by Berger Iron Works. The app processes steel takeoff data from their vendor Neilsoft and generates detailed material and labor cost estimates. Estimators import a CSV, review the parsed data, and produce formal quotes for structural, miscellaneous, and ornamental steel projects.

**Project Owner:** Todd Dawson (Contract review, project management, estimating)
**GitHub:** `https://github.com/tdawson360/steel-estimator`
**Working Branch:** `replit-phase1`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| UI | React 18, Tailwind CSS, Lucide Icons |
| Auth | NextAuth v4 (Credentials / JWT) |
| ORM | Prisma v6 |
| Database | SQLite (dev) → PostgreSQL (production target) |
| Language | JavaScript (JSX) — no TypeScript in components |
| Runtime | Node.js |

---

## Repository Structure

```
steel-estimator/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.js   # NextAuth handler
│   │   ├── import-csv/route.js           # NEW: 19-column takeoff CSV parser
│   │   ├── projects/route.js             # GET list, POST create
│   │   ├── projects/[id]/route.js        # GET, PUT, DELETE single project
│   │   ├── projects/[id]/status/route.js # Publish/reopen workflow
│   │   └── admin/users/                  # User management (ADMIN only)
│   ├── login/page.jsx
│   └── page.jsx                          # Root — loads SteelEstimator component
├── components/
│   └── SteelEstimator.jsx                # ~5800 lines — entire frontend app
├── lib/
│   ├── auth.js                           # NextAuth authOptions
│   └── db.js                             # Prisma client singleton
├── prisma/
│   ├── schema.prisma                     # Database schema
│   ├── seed.js                           # Creates default admin users
│   └── migrations/                       # Prisma migration history
├── middleware.js                         # Route protection (NextAuth)
└── .env.local                            # Environment variables (not committed)
```

---

## Local Setup

### 1. Clone & install
```bash
git clone https://github.com/tdawson360/steel-estimator
cd steel-estimator
npm install
```

### 2. Create `.env.local`
```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:5000"
NEXTAUTH_SECRET="your-secret-here"
```

Also create `.env` (used by Prisma CLI):
```env
DATABASE_URL="file:./dev.db"
```

> **Note:** For production, switch `DATABASE_URL` to a PostgreSQL connection string and update `prisma/schema.prisma` provider from `sqlite` to `postgresql`.

### 3. Set up the database
```bash
npx prisma migrate dev --name init
npx prisma generate
node prisma/seed.js
```

### 4. Run the dev server
```bash
npm run dev
# Runs on http://localhost:5000
```

### Default login credentials (created by seed)
| Email | Password | Role |
|-------|----------|------|
| `tdawson@bergerinc.com` | `BergerIron2024!` | ADMIN |
| `estimator@bergerinc.com` | `BergerIron2024!` | ADMIN |

---

## NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `next dev -p 5000 -H 0.0.0.0` | Start dev server |
| `npm run build` | `next build` | Production build |
| `npm run start` | `next start -p 5000 -H 0.0.0.0` | Start production server |
| `npm run db:generate` | `prisma generate` | Regenerate Prisma client |
| `npm run db:push` | `prisma db push` | Push schema without migration |
| `npm run db:seed` | `node prisma/seed.js` | Seed default users |

---

## User Roles

| Role | Permissions |
|------|-------------|
| `ADMIN` | Full access — create, edit, publish, manage users |
| `ESTIMATOR` | Create and edit estimates, cannot manage users |
| `PM` | Read-only, published projects only |
| `FIELD_SHOP` | Read-only, published projects only |

---

## Database Schema Summary

The full schema is in `prisma/schema.prisma`. Key models:

- **User** — Authentication and role management
- **Project** — Top-level estimate record (status: DRAFT → IN_REVIEW → PUBLISHED)
- **Item** — A line item within a project (e.g., "Stair #1", "Canopy Framing")
- **Material** — A steel shape line within an item (size, length, pieces, weight, cost)
- **MaterialFabrication** — A fab operation tied to a specific material
- **ItemFabrication** — A fab operation at the item level (e.g., coating, load-out)
- **RecapCost** — Per-item recap costs (installation, drafting, engineering, PM, shipping)
- **BreakoutGroup** — Groups items as Base Bid, Deduct, or Add alternate
- **Adjustment, Exclusion, Qualification, CustomRecapColumn** — Supporting project records

> **Important:** The current `SteelEstimator.jsx` manages all estimate state in React (not persisted to the Material/ItemFabrication tables yet). The API currently saves/loads a JSON blob. Migrating to fully normalized DB persistence is a future phase.

---

## API Routes

### Auth
- `POST /api/auth/[...nextauth]` — NextAuth sign-in/sign-out/session

### Projects
- `GET /api/projects` — List all projects (filtered by role)
- `POST /api/projects` — Create new project
- `GET /api/projects/[id]` — Load full project with all nested data
- `PUT /api/projects/[id]` — Save project (full JSON payload)
- `DELETE /api/projects/[id]` — Delete project
- `POST /api/projects/[id]/status` — Change status (publish, reopen)

### CSV Import
- `POST /api/import-csv` — Parse 19-column Neilsoft takeoff CSV (see spec below)

### Admin
- `GET /api/admin/users` — List users (ADMIN only)
- `POST /api/admin/users` — Create user
- `PUT /api/admin/users/[id]` — Update user
- `DELETE /api/admin/users/[id]` — Delete user

---

## CSV Importer — 19-Column Neilsoft Format

### Overview
`POST /api/import-csv` accepts a `multipart/form-data` upload with a `file` field. It parses the CSV, groups rows by `Item_Number`, generates material and labor line items, and returns a structured preview. The client then calls `executeTakeoffImport()` to merge the data into app state.

### Input CSV Column Layout

| # | Column Name | Description |
|---|-------------|-------------|
| 1 | `Item_Number` | Bid item number (e.g., "1", "2") |
| 2 | `Item_Description` | Work package name |
| 3 | `Member_Mark` | Piece mark — parent `"45"` / `"45.0"`, child `"45.1"`, `"45.2"` |
| 4 | `Part_Label` | Member type (BEAM, COLUMN, CLIP ANGLE, etc.) |
| 5 | `Drawing_Ref` | Drawing reference |
| 6 | `Shape_Size` | AISC shape string (e.g., `W 16 x 26`, `HSS 4 x 4 x 1/4`, `PL 3/8 x 6`) |
| 7 | `Quantity` | Number of pieces |
| 8 | `Length_Ft` | Piece length in feet |
| 9 | `End_1_Labor` | First end prep (see Labor Maps below) |
| 10 | `End_2_Labor` | Second end prep |
| 11 | `Holes` | Hole type |
| 12 | `Hole_Qty` | Number of holes |
| 13 | `Weld_Type` | Welding type |
| 14 | `Connection_Type` | Connection assembly type |
| 15 | `Connection_Qty` | Number of connections |
| 16 | `Prep_Ops` | Prep operations |
| 17 | `Coating` | Coating type |
| 18 | `Galvanized` | "Yes" / "No" |
| 19 | `Notes` | Free text |

### Labor Operation Mappings

**End Labor** (`End_1_Labor` / `End_2_Labor`)
- Supports compound values with `" + "` separator → generates two operations
- `Straight` → `Cut- Straight`
- `Miter` → `Cut- Miter`
- `Double Miter` → `Cut- Double Miter`
- `Single Cope` → `Cut- Single Cope End`
- `Double Cope` → `Cut- Double Cope End`
- `Profile` → `Cut- Profile`
- `Single Cope + Miter` → `Cut- Single Cope End` + `Cut- Miter`
- `Double Cope + Miter` → `Cut- Double Cope End` + `Cut- Miter`

**Drilling** (`Holes`)
- `Drill` → `Drill Holes`
- `Drill & C'sink` → `Drill & C'sink Holes`
- `Drill & Tap` → `Drill & Tap Holes`
- `Drill Thru` → `Drill Thru Holes`
- Quantity = `Hole_Qty` (skipped if 0)

**Welding** (`Weld_Type`)
- `Fillet` → `Welding- Fillet`
- `Bevel/Grind` → `Welding- Bevel/Grind`
- `PJP` → `Welding- PJP`
- `CJP` → `Welding- CJP`

**Connections** (`Connection_Type`)
- `WF Connx`, `C Connx`, `WF Moment Connx`, `C Moment Connx`, `Loose` → pass through as-is
- Quantity = `Connection_Qty` (defaults to 1 if blank)

**Prep** (`Prep_Ops`)
- `Ease`, `Splice`, `90's` → pass through as-is

**Coating** — Aggregated at item level:
- All rows same non-blank value → one item-level coating op added
- Any mixed or blank values → warning shown, no coating op added (manual entry required)

### API Response Shape
```json
{
  "success": true,
  "items": [{
    "itemNumber": "1",
    "itemName": "STRUCTURAL FRAMING",
    "drawingRef": "S-502",
    "members": [{
      "mark": "45",
      "isParent": true,
      "description": "BEAM",
      "size": "W 16 x 26",
      "length": 57.17,
      "pieces": 1,
      "galvanized": false,
      "fabrication": [
        { "operation": "Cut- Straight", "quantity": 1, "unit": "EA" }
      ],
      "children": [{
        "mark": "45.1",
        "isParent": false,
        "description": "CLIP ANGLE",
        "size": "L 3 x 3 x 1/4",
        "length": 0.75,
        "pieces": 2,
        "galvanized": false,
        "fabrication": [],
        "children": []
      }]
    }],
    "coatingUniform": "Prime Paint",
    "coatingMixed": false,
    "coatingMixedValues": []
  }],
  "stats": {
    "totalItems": 1,
    "totalMembers": 3,
    "totalFabOps": 8
  }
}
```

---

## Fabrication Operations Reference

Defined in `SteelEstimator.jsx` under `fabricationOperations`. Categories:

- **Cutting:** Cut- Straight, Cut- Miter, Cut- Double Miter, Cut- Single Cope End, Cut- Double Cope End, Cut- Profile
- **Drilling:** Drill Holes, Drill & C'sink Holes, Drill & Tap Holes, Drill Thru Holes
- **Prep:** Ease, Splice, 90's
- **Welding:** Welding- Fillet, Welding- Bevel/Grind, Welding- PJP, Welding- CJP
- **Coatings:** Prime Paint, Blast & Prime, Finish Paint, TNEMEC, Std. Shop Coat, Speciality Coating, Powder Coat, Anodized, Glass Bead Blast
- **Finishes:** #4 Satin, #8 Mirror, Non-Directional, Speciality Finish *(ornamental — manual entry only)*
- **Handling:** Handling, Fit up/Assembly, Shop Inspection, Shop Load-out, Hotshot *(manual entry only)*
- **Connections:** WF Connx, C Connx, WF Moment Connx, C Moment Connx, Loose

> `CONNECTION_WEIGHT_OPS` (Set) = WF Connx, C Connx, WF Moment Connx, C Moment Connx — these carry a weight-based cost (`connWeight`). `Loose` is excluded.

---

## Development Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Frontend UI (Items, Materials, Fab, Recap, Quote tabs) | ✅ Complete |
| Phase 1 | Backend API, auth, project save/load | ✅ Complete |
| Phase 1b | 19-column Neilsoft CSV importer | ✅ Complete |
| Phase 2 | Labor rate database + auto-pricing | 🔲 Not started |
| Phase 3 | Fully normalized DB persistence for materials/fab | 🔲 Not started |
| Phase 4 | Production deployment | 🔲 Not started |

---

## Known Issues / Notes

- **SQLite in dev only.** The schema uses `sqlite` for local development. For production, change `prisma/schema.prisma` provider back to `postgresql` and update `DATABASE_URL`. A new migration will be required.
- **JSON blob save.** The current PUT `/api/projects/[id]` saves the full estimate as a JSON payload. The Prisma `Material`, `MaterialFabrication`, and `ItemFabrication` tables exist in the schema but are not yet wired to the frontend save/load flow.
- **Prisma generate required.** After `npm install` or provider changes, run `npx prisma generate` before starting the server.
- **`SteelEstimator.jsx` is large (~5800 lines).** All estimate logic, state, and UI lives in this single component. Refactoring into sub-components is deferred.

---

## Contact

**Todd Dawson** — Berger Iron Works
`tdawson@bergerinc.com`
