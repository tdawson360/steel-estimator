// Load vendor pricing for A325 bolt sets into the hardware catalog.
//
//   node scripts/load-a325-pricing.mjs --dry      # show what would change
//   node scripts/load-a325-pricing.mjs            # apply
//
// Source: docs/hardware-seed/a325-pricing-2026-09.csv (converted from the
// vendor's returned docs/A325-pricing.xlsx; one line per diameter x length
// with a plain and/or HDG price per set, blank where the vendor had none).
//
// Rules (Todd, 2026-09-04): only sizes the vendor could price stay visible.
//   - plain price present  -> Plain item gets the price and stays active
//   - plain price blank    -> Plain item is deactivated (kept, so estimate rows
//                             that already snapshotted it are unaffected)
//   - HDG price present    -> an HDG variant row is created/updated (the
//                             estimator swaps a galvanized Hardware row to it)
//   - HDG price blank      -> any HDG variant is deactivated
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const DRY = process.argv.includes('--dry');
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prisma = new PrismaClient();

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map(line => {
    const out = {}; let i = 0, field = '', q = false;
    for (let c = 0; c <= line.length; c++) {
      const ch = line[c];
      if (ch === '"') { q = !q; continue; }
      if ((ch === ',' && !q) || c === line.length) { out[cols[i++]] = field; field = ''; continue; }
      field += ch;
    }
    return out;
  });
}

const rows = parseCsv(readFileSync(join(root, 'docs/hardware-seed/a325-pricing-2026-09.csv'), 'utf8'));
const items = await prisma.hardwareItem.findMany({ where: { family: 'A325' } });
const byKey = new Map(items.map(i => [`${i.diameter}|${i.length}|${i.finish}`, i]));

const stats = { priced: 0, repriced: 0, deactivated: 0, hdgCreated: 0, hdgUpdated: 0, hdgDeactivated: 0, missing: 0 };
const log = [];

for (const r of rows) {
  const plain = byKey.get(`${r.diameter}|${r.length}|Plain`);
  const hdg = byKey.get(`${r.diameter}|${r.length}|HDG`);
  const pPlain = r.plain ? Number(r.plain) : 0;
  const pHdg = r.hdg ? Number(r.hdg) : 0;
  const size = `${r.diameter}" x ${r.length}"`;
  if (!plain) { stats.missing++; log.push(`MISSING in catalog: ${size}`); continue; }

  if (pPlain > 0) {
    if (plain.unitPrice !== pPlain || !plain.active) {
      log.push(`${size} Plain: $${plain.unitPrice.toFixed(2)} -> $${pPlain.toFixed(2)}${plain.active ? '' : ' (reactivated)'}`);
      if (!DRY) await prisma.hardwareItem.update({ where: { id: plain.id }, data: { unitPrice: pPlain, active: true } });
      plain.unitPrice ? stats.repriced++ : stats.priced++;
    }
  } else if (plain.active) {
    log.push(`${size} Plain: no vendor price -> hidden`);
    if (!DRY) await prisma.hardwareItem.update({ where: { id: plain.id }, data: { active: false, isDefault: false } });
    stats.deactivated++;
  }

  if (pHdg > 0) {
    if (!hdg) {
      log.push(`${size} HDG: new variant $${pHdg.toFixed(2)}`);
      if (!DRY) await prisma.hardwareItem.create({ data: {
        kind: plain.kind, family: plain.family, name: plain.name, diameter: plain.diameter, diameterIn: plain.diameterIn,
        length: plain.length, lengthIn: plain.lengthIn, finish: 'HDG', unitPrice: pHdg, weightEach: plain.weightEach,
        isDefault: false, sortOrder: plain.sortOrder, active: true,
      } });
      stats.hdgCreated++;
    } else if (hdg.unitPrice !== pHdg || !hdg.active) {
      log.push(`${size} HDG: $${hdg.unitPrice.toFixed(2)} -> $${pHdg.toFixed(2)}`);
      if (!DRY) await prisma.hardwareItem.update({ where: { id: hdg.id }, data: { unitPrice: pHdg, active: true } });
      stats.hdgUpdated++;
    }
  } else if (hdg && hdg.active) {
    log.push(`${size} HDG: no vendor price -> hidden`);
    if (!DRY) await prisma.hardwareItem.update({ where: { id: hdg.id }, data: { active: false } });
    stats.hdgDeactivated++;
  }
}

// A325 sizes the vendor sheet does not list at all: hide them too.
const listed = new Set(rows.map(r => `${r.diameter}|${r.length}`));
for (const i of items) {
  if (!listed.has(`${i.diameter}|${i.length}`) && i.active) {
    log.push(`${i.diameter}" x ${i.length}" ${i.finish}: not on vendor sheet -> hidden`);
    if (!DRY) await prisma.hardwareItem.update({ where: { id: i.id }, data: { active: false, isDefault: false } });
    stats.deactivated++;
  }
}

// Make sure the family still has a default (3/4" x 2" Plain if it survived).
if (!DRY) {
  const def = await prisma.hardwareItem.findFirst({ where: { family: 'A325', active: true, isDefault: true } });
  if (!def) {
    const pick = await prisma.hardwareItem.findFirst({
      where: { family: 'A325', active: true, finish: 'Plain', unitPrice: { gt: 0 } },
      orderBy: [{ diameterIn: 'asc' }, { lengthIn: 'asc' }],
    });
    if (pick) { await prisma.hardwareItem.update({ where: { id: pick.id }, data: { isDefault: true } }); log.push(`default -> ${pick.diameter}" x ${pick.length}"`); }
  }
}

for (const l of log) console.log((DRY ? '[dry] ' : '') + l);
console.log(`\n${DRY ? 'DRY RUN. ' : ''}priced ${stats.priced}, repriced ${stats.repriced}, hidden ${stats.deactivated}, HDG created ${stats.hdgCreated}, HDG updated ${stats.hdgUpdated}, HDG hidden ${stats.hdgDeactivated}, missing ${stats.missing}`);
const active = await prisma.hardwareItem.count({ where: { family: 'A325', active: true } });
const activeUnpriced = await prisma.hardwareItem.count({ where: { family: 'A325', active: true, unitPrice: 0 } });
console.log(`A325 active now: ${active} (unpriced among them: ${activeUnpriced})`);
await prisma.$disconnect();
