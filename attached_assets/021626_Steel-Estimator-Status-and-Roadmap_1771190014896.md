# Berger Iron Works — Steel Estimator

## Application Status & Deployment Roadmap

**Prepared:** February 14, 2026
**Application Version:** v0.9 (Pre-Production)
**Codebase:** ~5,100 lines — Next.js / React single-page application

---

## 1. Current State — What's Built

### 1.1 Project Info Tab

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

### 1.2 Estimate Tab

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

### 1.3 Stock List Tab

- Consolidated stock list generated from all estimate items
- Grouped by shape with quantities and lengths

### 1.4 Recap Tab

- Per-item cost assignment for: Installation, Drafting, Engineering, Project Management (hours × rate), Shipping
- Custom column support (add/remove/rename)
- Markup percentage on each cost category
- **Auto-generated Tax column** driven by Project Info tax category selection
  - Calculates per-item tax based on correct cost components per category
  - Flows through to footer totals and summary bar
- Grand total includes all recap costs + tax

### 1.5 Summary Tab

- Project info header with tax category display
- Item-by-item cost summary table
- Breakout group management (Base, Deduct, Add) with item assignment
- General adjustments (internal-only, baked into total, hidden from quote)
- Grand total breakdown showing materials, fabrication, recap, tax, and adjustments
- Quote preview with base bid + deduct/add alternates

### 1.6 Quote Tab

- Print-ready quotation layout (8.5" × 11" format)
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

### 1.7 Technical Details

| Component | Detail |
|-----------|--------|
| Framework | Next.js with React |
| Styling | Tailwind CSS |
| State Management | React useState + useMemo |
| Icons | Lucide React |
| Architecture | Single component (SteelEstimator.jsx) |
| Data Persistence | None — browser memory only |
| Authentication | None |
| Backend API | None |

---

## 2. What's Required for Production Deployment

### 2.1 Data Persistence (Priority: Critical)

The application currently holds all data in React state. Closing the browser tab loses everything. This is the single most important gap.

**Database**

- PostgreSQL (recommended) or similar relational database
- Schema design for: Projects, Items, Materials, Fabrication Operations, Recap Costs, Breakout Groups, Adjustments, Tax Settings, Exclusions, Qualifications
- Migration system for future schema changes

**Save/Load**

- Auto-save on change (debounced) or explicit save button
- Project list / dashboard as the landing page
- Open, duplicate, and delete projects
- Project search and filtering

**Data Export**

- PDF export of the Quote tab (server-side rendering, not just browser print)
- Excel/CSV export of estimate data, recap, and summary
- Backup and restore capability

### 2.2 Authentication & User Management (Priority: Critical)

**User Roles**

| Role | Create | Edit (Draft) | Edit (Locked) | View | Lock/Unlock | Manage Users |
|------|--------|-------------|---------------|------|-------------|-------------|
| Admin | Yes | Yes | Yes (unlock first) | Yes | Yes | Yes |
| Estimator | Yes | Yes | No | Yes | Lock only | No |
| Project Manager | No | No | No | Read-only | No | No |

**Estimate Status Lifecycle**

- **Draft** — fully editable by Admin and Estimator roles
- **Complete/Locked** — read-only for all users; Estimator can lock, only Admin can unlock
- **Revised** — Admin creates a new revision from a locked estimate, preserving the original record for audit trail

**Implementation**

- Login system (email/password or SSO if integrating with existing Berger systems)
- Session management with secure tokens
- Password reset flow
- Audit log for who changed what and when

### 2.3 Backend API (Priority: Critical)

The React front-end needs a server layer to talk to the database and enforce permissions.

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

**Technology Options**

- Next.js API Routes (simplest — keeps everything in one project)
- Separate Express.js or Fastify backend (more flexibility if other systems will integrate)

### 2.4 Hosting Infrastructure (Priority: Critical)

**Server Requirements**

- Linux server (Ubuntu 22.04+ recommended)
- Node.js 18+ runtime
- PostgreSQL 15+
- Nginx as reverse proxy
- PM2 process manager to keep the app alive and auto-restart on crash
- SSL certificate (Let's Encrypt for free, auto-renewing)

**Hosting Options**

| Option | Pros | Cons |
|--------|------|------|
| On-premise server at Berger | Full control, no recurring cloud costs, data stays in-house | You manage hardware, backups, uptime |
| VPS (DigitalOcean, Vultr, Linode) | ~$12-48/month, easy setup, managed backups available | Data on third-party infrastructure |
| AWS/Azure | Scalable, enterprise-grade | More complex, higher cost for small team |

**Recommendation:** If Berger has a server or can dedicate a machine, on-premise keeps costs at zero and data fully under your control. A $24/month VPS is the fallback if dedicated hardware isn't available.

**Backup Strategy**

- Automated daily database backups
- Off-site backup copy (even a simple scheduled dump to a USB drive or cloud storage)
- Test restore procedure documented

### 2.5 Production Hardening (Priority: High)

- Environment variables for database credentials, session secrets, API keys
- Server-side input validation (never trust browser-submitted data alone)
- Rate limiting on API endpoints
- Security headers (CORS, CSP, HSTS)
- Error logging and monitoring (even a simple log file to start)
- HTTPS enforced on all routes

### 2.6 Application Refactoring (Priority: High)

The current single-file architecture works for development but should be broken up before adding backend integration.

- Split SteelEstimator.jsx into smaller components (ProjectInfo, EstimateItem, RecapTable, QuoteView, etc.)
- Extract business logic (tax calculations, totals, nesting optimization) into utility modules
- Add loading states for database operations
- Add error handling UI (save failures, network issues)
- Add toast notifications for user feedback (saved, locked, permission denied, etc.)

---

## 3. Nice-to-Have Features (Post-Launch)

These are not blocking deployment but add significant value over time.

**Steel Price Management**

- Admin-editable steel price database (currently hardcoded)
- Price effective dates for historical accuracy
- Import prices from supplier quotes

**Actual vs. Estimated Cost Tracking**

- After a project is complete, enter actual material and fabrication costs
- Variance reports: estimated vs. actual by item, by category
- Trend analysis across projects to improve future estimating accuracy
- The item-level breakouts already built on the Estimate tab provide the structure for this

**Customer Database**

- Reusable customer/contact records that auto-fill across projects
- Customer history — all quotes sent to a given company

**Project Versioning**

- Full revision history with diff view
- Compare two revisions side-by-side
- Timestamp and user attribution on every change

**Multi-User Collaboration**

- Optimistic locking to prevent two estimators from editing the same project simultaneously
- "Currently being edited by..." indicator

**Reporting Dashboard**

- Open estimates by status (draft, locked)
- Estimator workload
- Win/loss tracking on quotes
- Revenue pipeline from active quotes

**Integration Opportunities**

- Tekla/Fabrication software data exchange
- Accounting system integration for invoicing
- Email integration for sending quotes directly

---

## 4. Suggested Build Order

| Phase | Scope | Estimated Effort |
|-------|-------|-----------------|
| **Phase 1** | Database schema + save/load + project dashboard | Core sprint |
| **Phase 2** | Authentication + user roles + estimate locking | Core sprint |
| **Phase 3** | Component refactoring + error handling + loading states | Cleanup sprint |
| **Phase 4** | Hosting setup + SSL + backups + go live | Infrastructure sprint |
| **Phase 5** | PDF/Excel export (server-side) | Feature sprint |
| **Phase 6** | Steel price management | Feature sprint |
| **Phase 7** | Actual vs. estimated tracking | Feature sprint |
| **Phase 8** | Customer database + reporting | Feature sprint |

Phases 1-4 represent the minimum viable deployment. Phases 5-8 can be built incrementally while the team is actively using the application.

---

## 5. Current File Structure

```
steel-estimator/
├── app/
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── components/
│   └── SteelEstimator.jsx    (5,089 lines — all UI + logic)
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── README.md
```

---

*This document reflects the application state as of February 14, 2026. All three original backlog items (fab category restructure, tax category system, item-level breakout totals) have been completed.*
