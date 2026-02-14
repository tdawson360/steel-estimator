# Steel Estimator v2.0

Professional steel fabrication estimating tool built with Next.js and React.

## Features

- **Project Management** - Track project details, customer info, drawings
- **Material Estimating** - Full AISC v16.0 shape database with automatic weight calculations
- **Parent/Child Materials** - Main members (A, B, C) with attachments (A1, A2, B1)
- **Nested Fabrication** - Fab ops tied to specific materials with "Connect to" linking
- **Stock Optimization** - Intelligent nesting to minimize waste
- **Fabrication Costing** - Material-level and item-level fab with multiply-by-pieces
- **Recap Costs** - Installation, drafting, engineering, PM, shipping
- **General Adjustments** - Rounding, contingency, discounts (internal only)
- **Breakout Groups** - Base bid, deducts, and add alternates
- **Quote Generation** - Professional proposal output
- **RFQ Export** - Request vendor pricing via text, CSV, or print
- **Bluebeam Integration** - Import CSV takeoffs from Revu
- **Galvanizing** - Auto-calculated by weight for any material

## Nested Fabrication

Fab operations are now tied to specific materials:
- Each material has its own fab list (cut, drill, weld, etc.)
- "Connect to" dropdown: Apply (just this piece) or link to another material (e.g., "Weld A1 to A")
- Multiply by pieces: Auto-calculates total qty based on material piece count
- Item-level fab still available for general ops (handling, prime paint)

## Rounding Rules

- Weights and prices use custom rounding: <=0.29 rounds down, >0.29 rounds up
- Quote tab displays prices with 2 decimal places ($1,234.00)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000)

## Build for Production

```bash
npm run build
npm start
```

## Tech Stack

- Next.js 14
- React 18
- Tailwind CSS
- Lucide React Icons

## File Structure

```
steel-estimator/
├── app/
│   ├── layout.js       # Root layout
│   ├── page.js         # Home page
│   └── globals.css     # Global styles
├── components/
│   └── SteelEstimator.jsx  # Main component (~4,000 lines)
├── public/             # Static assets
├── package.json
├── next.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Version History

### v2.0.0
- Added General Adjustments feature (Summary tab)
- Custom rounding rule implementation
- Quote tab 2-decimal price formatting
- CSV import encoding fix for Bluebeam exports
- Added missing AISC shapes (MC channels, HSS variants)
- Import modal visibility fix across all tabs
- Quote tab redesign:
  - "PROPOSAL" renamed to "QUOTATION" (centered below logo)
  - Added AISC Code of Standard Practice legal terms
  - Tax exclusion notice
  - 30-day acceptance terms
  - Right-aligned: To, Attn, Phone, Email, Drawing Reference
  - Right-aligned: Base Bid price, Deduct/Add options
  - Right-aligned: Accepted By, Authorized Signature, Date
  - Updated footer contingency clause
- Parent/Child Materials:
  - Materials now have sequence labels (A, B, C... for parents)
  - Add attachments under parent materials (A1, A2, B1...)
  - Child materials inherit piece count from parent by default
  - Visual hierarchy in materials table
  - CSV imports create parent materials with sequences
  - Deleting parent cascades to delete children
- Category Updates:
  - Removed S Shape and HP Shape categories
  - Combined Flat Bar and Plate into new "Flats" category
  - Flats uses "FL THKxW" naming (e.g., FL 1/2x6)
  - 198 Flats sizes from FLATS.CSV (1/8" to 1" thick)
  - Sizes displayed in fractions for better UX
