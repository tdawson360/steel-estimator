# Berger Iron Works — Steel Estimator

## Application Status & Deployment Roadmap

**Prepared:** February 14, 2026
**Application Version:** v4.6.7
**Codebase:** ~5,100 lines — Next.js / React single-page application
**Repository:** https://github.com/tdawson360/steel-estimator (private)

---

## 1. Current State — What's Built

### 1.1 Application Features

#### Project Info Tab

- Customer information (company, contact, billing, phone, email)
- Project details (name, address, drawing date/revision, architect, estimate date/by)
- Project type classification (Structural, Miscellaneous, Ornamental)
- Delivery options (Installed, F.O.B. Jobsite, Will Call)
- **Tax category selector** with four categories and descriptions:
  - New Construction — 8.25% on materials only
  - Resale — no tax (buyer provides resale certificate)
  - F.O.B. — 8.25% on materials + fabrication
  - No Tax — exempt entities
- Standard and custom exclusions
- Standard and custom qualifications

#### Estimate Tab

- Multi-item estimate with collapsible item panels
- **Material entry** with full steel database (~200+ shapes across W, HSS, Pipe, Angle, Channel, Flat Bar, Plate categories)
- Stock length optimization with nesting calculations and waste/efficiency reporting
- Per-material fabrication operations with cost tracking
- Child/sub-material support (embedded components per parent material)
- Galvanizing toggle with automatic galv line generation on connection operations
- **Fabrication categories** organized into three groups:
  - Coatings (Prime Paint, Blast & Prime, Finish Paint, TNEMEC, Specialty Coating, Std. Shop Coat, Anodized, Powder Coat, Glass Bead Blast)
  - Finishes (#4 Satin, #8 Mirror, Non-Directional, Specialty Finish)
  - Handling (Handling, Fit up/Assembly, Shop Inspection, Shop Load-out, Hotshot)
- Item-level general fabrication operations
- **Item-level cost breakouts** showing:
  - Material cost
  - Material markup (% input + dollar amount)
  - Fabrication cost
  - Fab markup (% input + dollar amount)
  - Total item cost
- Fab weight tracking (including connection weights)
- Breakout group assignment per item
- CSV import for bulk material entry
- Estimate-level totals bar (fab weight, stock weight, material, markup, fabrication, grand total)

#### Stock List Tab

- Consolidated stock list generated from all estimate items
- Grouped by shape with quantities and lengths

#### Recap Tab

- Per-item cost assignment for: Installation, Drafting, Engineering, Project Management (hours x rate), Shipping
- Custom column support (add/remove/rename)
- Markup percentage on each cost category
- **Auto-generated Tax column** driven by Project Info tax category selection
  - Calculates per-item tax based on correct cost components per category
  - Flows through to footer totals and summary bar
- Grand total includes all recap costs + tax

#### Summary Tab

- Project info header with tax category display
- Item-by-item cost summary table
- Breakout group management (Base, Deduct, Add) with item assignment
- General adjustments (internal-only, baked into total, hidden from quote)
- Grand total breakdown showing materials, fabrication, recap, tax, and adjustments
- Quote preview with base bid + deduct/add alternates

#### Quote Tab

- Print-ready quotation layout (8.5" x 11" format)
- Company logo and header
- **Dynamic legal terms block** — tax disclaimer conditionally removed when tax is included in the price
- Customer and project information
- Item listing with drawing references
- Base bid price with delivery method
- **"TAX INCLUDED" notation** positioned below underlined price when applicable
- **Comma-safe price underline** using border-bottom instead of text-decoration
- Deduct and add alternate pricing
- Qualifications and exclusions sections
- Signature block with acceptance terms
- Print CSS for clean output

### 1.2 Development Infrastructure (Completed Feb 14, 2026)

| Component | Status | Detail |
|-----------|--------|--------|
| Node.js | Installed | v24.13.1 |
| PostgreSQL | Installed | v17.8 |
| Git | Installed | v2.53.0 |
| Database | Created | `berger_estimator` on localhost:5432 |
| Prisma ORM | Installed | v6 — schema designed and migrated |
| Database Schema | Deployed | 14 tables covering all application data |
| Repository | Connected | GitHub private repo — tdawson360/steel-estimator |
| Project Folder | Established | `C:\Projects\steel-estimator` (off OneDrive) |

### 1.3 Database Tables Deployed

| Table | Purpose |
|-------|---------|
| User | Authentication, roles (Admin, Estimator, PM) |
| Project | Top-level estimate record with all project info fields |
| Item | Line items within a project |
| Material | Steel shapes, lengths, quantities, pricing per item |
| MaterialFabrication | Fab operations tied to specific materials |
| ChildMaterial | Sub-materials embedded within parent materials |
| ChildMaterialFabrication | Fab operations on child materials |
| ItemFabrication | Item-level general fab operations |
| RecapCost | Per-item recap costs (installation, drafting, etc.) |
| CustomRecapColumn | User-defined recap columns |
| BreakoutGroup | Quote breakout groups (base, deduct, add) |
| Adjustment | Internal-only general adjustments |
| Exclusion | Standard and custom exclusions |
| Qualification | Standard and custom qualifications |

---

## 2. What's Required for Production Deployment

### 2.1 Backend API (Priority: Critical — Next to Build)

The React front-end needs server routes to read/write to the database.

**API Routes Needed**

- `POST /api/projects` — create new project
- `GET /api/projects` — list projects (with search, filter, pagination)
- `GET /api/projects/:id` — load full project with all nested data
- `PUT /api/projects/:id` — save/update project
- `DELETE /api/projects/:id` — delete project
- `POST /api/projects/:id/lock` — lock estimate
- `POST /api/projects/:id/unlock` — unlock (admin only)
- `POST /api/projects/:id/revise` — create revision from locked estimate
- `GET /api/projects/:id/export/pdf` — generate PDF
- `GET /api/projects/:id/export/excel` — generate Excel
- `POST /api/auth/login` — authenticate
- `POST /api/auth/logout` — end session
- `GET /api/users` — manage users (admin)

**Technology:** Next.js API Routes (keeps everything in one project)

### 2.2 Save/Load Functionality (Priority: Critical)

- Wire front-end state to API routes
- Auto-save on change (debounced) or explicit save button
- Loading states and error handling in the UI
- Project list / dashboard as the landing page
- Open, duplicate, and delete projects

### 2.3 Authentication & User Management (Priority: Critical)

**User Roles**

| Role | Create | Edit (Draft) | Edit (Locked) | View | Lock/Unlock | Manage Users |
|------|--------|-------------|---------------|------|-------------|-------------|
| Admin | Yes | Yes | Yes (unlock first) | Yes | Yes | Yes |
| Estimator | Yes | Yes | No | Yes | Lock only | No |
| Project Manager | No | No | No | Read-only | No | No |

**Estimate Status Lifecycle**

- **Draft** — fully editable by Admin and Estimator roles
- **Complete/Locked** — read-only for all users; Estimator can lock, only Admin can unlock
- **Revised** — Admin creates a new revision from a locked estimate, preserving the original for audit trail

**Implementation**

- Login system (email/password)
- Session management with secure tokens
- Password reset flow
- Read-only UI rendering for PM role (inputs become plain text)
- Audit log for who changed what and when

### 2.4 Hosting & Deployment to Office Server (Priority: Critical)

**Server Requirements**

- Windows Server or Windows PC at Berger
- Node.js 24+ runtime
- PostgreSQL 17+
- SSL certificate for HTTPS
- Process manager to keep the app running

**Steps**

- Install Node.js and PostgreSQL on the office server (same process as laptop)
- Clone the GitHub repository to the server
- Configure `.env` with production database credentials
- Run Prisma migrations to build the database
- Set up the app to start automatically on boot
- Configure Windows Firewall to allow access from other machines on the network
- Set up scheduled database backups

### 2.5 Production Hardening (Priority: High)

- Environment variables for all sensitive config
- Server-side input validation
- Rate limiting on API endpoints
- Security headers (CORS, CSP, HSTS)
- Error logging and monitoring
- HTTPS enforced on all routes

### 2.6 Application Refactoring (Priority: High)

- Split SteelEstimator.jsx (~5,100 lines) into smaller components
- Extract business logic into utility modules
- Add loading states for database operations
- Add error handling UI (save failures, network issues)
- Add toast notifications for user feedback

---

## 3. Nice-to-Have Features (Post-Launch)

**Steel Price Management**

- Admin-editable steel price database (currently hardcoded)
- Price effective dates for historical accuracy
- Import prices from supplier quotes

**Actual vs. Estimated Cost Tracking**

- Enter actual material and fabrication costs after project completion
- Variance reports: estimated vs. actual by item, by category
- Trend analysis across projects to improve estimating accuracy
- Item-level breakouts already provide the structure for this

**Customer Database**

- Reusable customer/contact records that auto-fill across projects
- Customer history — all quotes sent to a given company

**Project Versioning**

- Full revision history with diff view
- Compare two revisions side-by-side

**Multi-User Collaboration**

- Optimistic locking to prevent simultaneous edits
- "Currently being edited by..." indicator

**Reporting Dashboard**

- Open estimates by status (draft, locked)
- Estimator workload and win/loss tracking
- Revenue pipeline from active quotes

**Integration Opportunities**

- Tekla/Fabrication software data exchange
- Accounting system integration
- Email integration for sending quotes directly

**CSV Import Update**

- On hold pending Neilsoft takeoff format finalization
- Current import works but column mapping will need to align with their structure

---

## 4. Build Order

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 0** | Development infrastructure (Node, PostgreSQL, Git, Prisma, GitHub) | **COMPLETE** |
| **Phase 1** | Backend API routes + save/load + project dashboard | Next |
| **Phase 2** | Authentication + user roles + estimate locking | Pending |
| **Phase 3** | Component refactoring + error handling + loading states | Pending |
| **Phase 4** | Hosting setup on office server + go live | Pending |
| **Phase 5** | Server-side PDF/Excel export | Pending |
| **Phase 6** | Steel price management | Pending |
| **Phase 7** | Actual vs. estimated tracking | Pending |
| **Phase 8** | Customer database + reporting | Pending |

Phases 0-4 represent the minimum viable deployment. Phases 5-8 can be built incrementally while the team is actively using the application.

---

## 5. Developer Workflow

**Project location:** `C:\Projects\steel-estimator`

**When files are updated:**

```
cd C:\Projects\steel-estimator
git add .
git commit -m "describe what changed"
git push
```

**View change history:**

```
git log --oneline
```

**After pulling to a new machine or fresh clone:**

```
git clone https://github.com/tdawson360/steel-estimator.git
cd steel-estimator
npm install
```

Then copy `.env` file manually (never stored in Git — contains database password).

---

## 6. Current File Structure

```
C:\Projects\steel-estimator\
├── .env                          (database connection — NOT in Git)
├── .gitignore
├── package.json
├── package-lock.json
├── next.config.js
├── postcss.config.js
├── tailwind.config.js
├── README.md
├── app/
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── components/
│   └── SteelEstimator.jsx       (5,089 lines — all UI + logic)
└── prisma/
    ├── schema.prisma             (database table definitions)
    └── migrations/
        └── 20260214153619_initial_schema/
            └── migration.sql     (SQL that built the tables)
```

---

*This document reflects the application state as of February 14, 2026. All three original backlog items have been completed. Phase 0 infrastructure is fully established. Next step: Phase 1 — API routes and save/load functionality.*
