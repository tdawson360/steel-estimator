# Berger Iron Works — Steel Estimator

## Overview
A full-stack steel estimating application for Berger Iron Works. Covers the complete workflow from project setup through to print-ready quotations. Built with Express + React + PostgreSQL.

## Recent Changes
- 2026-02-15: Initial MVP build — Dashboard, 6-tab estimator (Project Info, Estimate, Stock List, Recap, Summary, Quote), database persistence, seed data

## Architecture
- **Frontend**: React with TypeScript, Vite, TailwindCSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **State**: TanStack React Query for server state management
- **Routing**: Wouter for client-side routing

## Key Files
- `shared/schema.ts` — All database schemas, types, constants (steel shapes DB, tax categories, fab categories)
- `server/routes.ts` — All API endpoints
- `server/storage.ts` — Database storage layer (DatabaseStorage class)
- `server/db.ts` — Database connection
- `server/seed.ts` — Seed data for demo projects
- `client/src/pages/dashboard.tsx` — Project list / landing page
- `client/src/pages/project.tsx` — Main project editor with 6 tabs
- `client/src/components/project-info-tab.tsx` — Customer & project info, tax, exclusions, qualifications
- `client/src/components/estimate-tab.tsx` — Items, materials, fabrication operations, cost calculations
- `client/src/components/stock-list-tab.tsx` — Consolidated stock list
- `client/src/components/recap-tab.tsx` — Installation, drafting, engineering, PM, shipping costs
- `client/src/components/summary-tab.tsx` — Cost summary, breakout groups, adjustments
- `client/src/components/quote-tab.tsx` — Print-ready quotation
- `client/src/lib/calculations.ts` — Business logic (weight, cost, tax calculations)
- `client/src/lib/hooks.ts` — React Query hooks for all API calls

## API Routes
- `GET/POST /api/projects` — List/create projects
- `GET/PATCH/DELETE /api/projects/:id` — Get/update/delete project
- `GET/POST /api/projects/:id/items` — List/create estimate items
- `PATCH/DELETE /api/items/:id` — Update/delete item
- `GET/POST /api/items/:id/materials` — List/create materials
- `GET /api/projects/:id/materials` — All materials grouped by item
- `PATCH/DELETE /api/materials/:id` — Update/delete material
- `GET /api/projects/:id/recap` — Recap costs by project
- `PUT /api/items/:id/recap` — Upsert recap cost
- `GET/POST /api/projects/:id/adjustments` — List/create adjustments
- `PATCH/DELETE /api/adjustments/:id` — Update/delete adjustment

## Database Tables
- `projects` — Customer info, project details, tax category, exclusions, qualifications
- `estimate_items` — Line items with breakout groups, markup percentages, general fab ops
- `materials` — Steel shapes with dimensions, quantities, prices, fab operations
- `recap_costs` — Per-item costs (installation, drafting, engineering, PM, shipping)
- `summary_adjustments` — Project-level adjustments

## Steel Shapes Database
~200+ shapes across categories: W (Wide Flange), HSS (Hollow Structural), Pipe, Angle, Channel, Flat Bar, Plate
