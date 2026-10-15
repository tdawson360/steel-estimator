// Seed the custom fab operations the Bluebeam takeoff can name (Global Pricing
// Data → Custom ops). Decided by Todd 2026-10-15 while reviewing Bidding
// Enterprise's profile v1.7.7:
//
//   Apply- Groove Weld      $/in   butt joint the drawing does not call PJP/CJP
//   Apply- Plug/Slot Weld   $/ea   plug or slot weld; priced apart from fillet
//                                  because it carries the hole it needs
//   Returns                 $/ea   handrail wall-return 90 with a capped end
//   Rail Start / Rail End   $/ea   handrail end loops
//   Shear & Brake           $/ea   bent plate, or plate sheared to a size no
//                                  wholesaler stocks
//
//   node scripts/seed-custom-ops.mjs            # upsert by name (rates untouched)
//   node scripts/seed-custom-ops.mjs --dry-run
//
// Rates are entered on Global Pricing Data; this script never overwrites a
// rate. The importer maps Bluebeam values to these names
// (lib/estimating/import-takeoff.js) and prices them on import
// (lib/import-takeoff-server.js).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

const OPS = [
  { name: 'Apply- Groove Weld',    category: 'Apply', defaultUnit: 'IN', sortOrder: 10 },
  { name: 'Apply- Plug/Slot Weld', category: 'Apply', defaultUnit: 'EA', sortOrder: 11 },
  { name: 'Returns',               category: 'Prep',  defaultUnit: 'EA', sortOrder: 20 },
  { name: 'Rail Start',            category: 'Prep',  defaultUnit: 'EA', sortOrder: 21 },
  { name: 'Rail End',              category: 'Prep',  defaultUnit: 'EA', sortOrder: 22 },
  { name: 'Shear & Brake',         category: 'Prep',  defaultUnit: 'EA', sortOrder: 23 },
];

let created = 0, updated = 0, unchanged = 0;
try {
  for (const op of OPS) {
    const existing = await prisma.customFabOperation.findUnique({ where: { name: op.name } });
    if (!existing) {
      created++;
      console.log(`create: ${op.name} (${op.category}, ${op.defaultUnit}, $0 — set the rate on Global Pricing Data)`);
      if (!DRY) await prisma.customFabOperation.create({ data: { ...op, rate: 0, active: true } });
      continue;
    }
    const patch = {};
    for (const f of ['category', 'defaultUnit', 'sortOrder']) if (existing[f] !== op[f]) patch[f] = op[f];
    if (!existing.active) patch.active = true;
    if (Object.keys(patch).length === 0) { unchanged++; continue; }
    updated++;
    console.log(`update: ${op.name} ${JSON.stringify(patch)}`);
    if (!DRY) await prisma.customFabOperation.update({ where: { id: existing.id }, data: patch });
  }
  console.log(`${DRY ? '[dry-run] ' : ''}custom ops: ${created} created, ${updated} updated, ${unchanged} unchanged`);
} finally {
  await prisma.$disconnect();
}
