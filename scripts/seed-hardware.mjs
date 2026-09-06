// Seed / refresh the hardware catalog from docs/hardware-seed/*.csv.
//
//   node scripts/seed-hardware.mjs            # upsert (keeps admin-edited prices)
//   node scripts/seed-hardware.mjs --dry-run  # report only
//
// Idempotent: items are matched on (family, name, diameter, length, finish).
// An existing item keeps its isDefault and active flags, and keeps a non-zero
// unitPrice (admin-owned); a $0 price is filled from the sheet. Weight and
// setting data are refreshed from the sheets. A family's seed default is
// applied only when that family has no default yet.
//
// Decisions baked in (Todd, 2026-09-03): A325 only in 1/2" length steps,
// default 3/4" x 2"; Kwik Bolt = Hilti's current Kwik Bolt TZ2 sizes
// (kwik-bolt-tz2.csv), default 1/2" x 5-1/2"; HAS-V-36 default 1/2" x 6-1/2"
// (nearest standard pre-cut to the 6" Todd wanted); no 1-1/2" rods; adhesive
// family "Adhesive" = HIT-HY 200 V3, HIT-RE 500 V3, HIT-HY 270, 330 ml only;
// every rod links to HIT-HY 200 V3 by default. Prices: Hilti.com net.

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
const SEED_DIR = path.join(process.cwd(), 'docs', 'hardware-seed');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v !== '')) rows.push(row); }
  const [header, ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const read = (name) => parseCsv(fs.readFileSync(path.join(SEED_DIR, name), 'utf8'));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const frac = (s) => {
  const str = String(s || '').trim();
  const m = str.match(/^(\d+)?\s*[- ]?\s*(\d+)\/(\d+)$/);
  if (m) return (m[1] ? parseInt(m[1], 10) : 0) + parseInt(m[2], 10) / parseInt(m[3], 10);
  return num(str);
};

// ── Build the desired catalog ───────────────────────────────────────────────
const desired = [];

// Adhesives — one family, three Hilti products, 330 ml only. Rods link to HY 200.
const adhesiveKey = (name) => ({ family: 'Adhesive', name, diameter: '', length: '330 ml', finish: 'Plain' });
const HY200 = adhesiveKey('HIT-HY 200 V3');
read('adhesives.csv').forEach((r, i) => {
  desired.push({
    ...adhesiveKey(r.name), kind: 'ADHESIVE', diameterIn: 0, lengthIn: 0,
    weightEach: num(r.weight_each_lb), cartridgeMl: num(r.cartridge_ml) || 330,
    unitPrice: num(r.unit_price), isDefault: r.default === 'yes', sortOrder: 40 + i,
  });
});

// A325 bolt sets — half-inch lengths only (no price source yet: stays $0 until priced)
for (const r of read('a325-bolt-sets.csv')) {
  if (!r.set_weight_each_lb) continue;              // skips the per-inch adder rows
  const lengthIn = num(r.length_in);
  if (Math.abs(lengthIn * 2 - Math.round(lengthIn * 2)) > 1e-9) continue;
  desired.push({
    kind: 'BOLT_SET', family: 'A325', name: '', diameter: r.diameter, diameterIn: frac(r.diameter),
    length: r.length, lengthIn, finish: 'Plain',
    weightEach: num(r.set_weight_each_lb), unitPrice: num(r.unit_price),
    isDefault: r.diameter === '3/4' && lengthIn === 2, sortOrder: 10,
  });
}

// Kwik Bolt — Hilti Kwik Bolt TZ2 current sizes (zinc; nut & washer included)
for (const r of read('kwik-bolt-tz2.csv')) {
  desired.push({
    kind: 'EXPANSION_ANCHOR', family: 'Kwik Bolt', name: '', diameter: r.diameter, diameterIn: frac(r.diameter),
    length: r.length, lengthIn: num(r.length_in), finish: 'Zinc',
    weightEach: num(r.weight_each_lb), unitPrice: num(r.unit_price),
    isDefault: r.default === 'yes', sortOrder: 20,
  });
}

// Hilti HAS adhesive anchor rods (standard pre-cut program only)
const HAS_FAMILY = {
  'HAS-V-36 (F1554 Gr36, zinc)': ['HAS-V-36', 'Zinc'],
  'HAS-E-55 (F1554 Gr55, zinc)': ['HAS-E-55', 'Zinc'],
  'HAS-B-105 HDG (A193 B7 / F1554 Gr105, hot-dip galv)': ['HAS-B-105 HDG', 'HDG'],
};
for (const r of read('hilti-has-rods.csv').filter(r => frac(r.diameter) < 1.5)) {
  const [family, finish] = HAS_FAMILY[r.family] || [r.family, 'Zinc'];
  desired.push({
    kind: 'ADHESIVE_ANCHOR', family, name: '', diameter: r.diameter, diameterIn: frac(r.diameter),
    length: r.length, lengthIn: num(r.length_in), finish,
    weightEach: num(r.weight_each_lb_est), unitPrice: num(r.unit_price),
    bitDiaIn: frac(r.bit_dia_in), embedMinIn: frac(r.hef_min_in), embedMaxIn: frac(r.hef_max_in),
    adhesiveKey: HY200,
    isDefault: family === 'HAS-V-36' && r.diameter === '1/2' && r.length === '6-1/2',
    sortOrder: family === 'HAS-V-36' ? 30 : family === 'HAS-E-55' ? 31 : 32,
  });
}

// F1554 Gr36 / Gr50 / Gr55 cast-in anchor rods (Todd, 2026-09-05/06): outsourced, priced
// per each with nuts and washers (plate washers per the detail). Plain and HDG
// variants; HDG is bought pre-galvanized (hardware never dips). Prices are
// entered on Global Pricing Data (no vendor sheet yet), so seed rows stay $0.
for (const r of read('f1554-anchor-rods.csv')) {
  for (const finish of ['Plain', 'HDG']) {
    desired.push({
      kind: 'ANCHOR_ROD', family: r.family, name: '', diameter: r.diameter, diameterIn: frac(r.diameter),
      length: r.length, lengthIn: num(r.length_in), finish,
      weightEach: num(r.weight_each_lb_est), unitPrice: num(r.unit_price),
      isDefault: r.family === 'F1554 Gr36' && r.diameter === '3/4' && r.length === '18',
      sortOrder: r.family === 'F1554 Gr36' ? 35 : r.family === 'F1554 Gr50' ? 36 : 37,
    });
  }
}

// ── One-time fixups from earlier seed shapes ────────────────────────────────
const uniq = (i) => ({ family: i.family, name: i.name || '', diameter: i.diameter, length: i.length, finish: i.finish });
const keyOf = (i) => Object.values(uniq(i)).join('|');

async function fixups() {
  // Adhesive used to be its own family named after the product.
  const oldAdhesive = await prisma.hardwareItem.findMany({ where: { kind: 'ADHESIVE', family: { not: 'Adhesive' } } });
  for (const a of oldAdhesive) {
    console.log(`fixup: adhesive "${a.family}" → family Adhesive / name ${a.family}`);
    if (!DRY) await prisma.hardwareItem.update({ where: { id: a.id }, data: { family: 'Adhesive', name: a.family } });
  }
  // The 1/2" x 6" HAS-V-36 was a cut-to-length size, not a standard pre-cut.
  for (const c of await prisma.hardwareItem.findMany({ where: { family: 'HAS-V-36', diameter: '1/2', length: '6' } })) {
    console.log('fixup: removing non-standard 1/2" HAS-V-36 x 6"');
    if (!DRY) await prisma.hardwareItem.delete({ where: { id: c.id } });
  }
  // Kwik Bolt sizes now follow Hilti's current TZ2 offering: drop classic
  // sizes Hilti no longer sells (the seed sheet kwik-bolt.csv keeps them).
  const wanted = new Set(desired.filter(i => i.family === 'Kwik Bolt').map(keyOf));
  for (const k of await prisma.hardwareItem.findMany({ where: { family: 'Kwik Bolt' } })) {
    if (wanted.has(keyOf(k))) continue;
    console.log(`fixup: removing discontinued Kwik Bolt ${k.diameter}" x ${k.length}"`);
    if (!DRY) await prisma.hardwareItem.delete({ where: { id: k.id } });
  }
}

// ── Upsert ──────────────────────────────────────────────────────────────────
const seen = new Set();
let created = 0, updated = 0, unchanged = 0, priced = 0;

async function upsert(item) {
  const { adhesiveKey: adhKey, ...data } = item;
  const key = keyOf(item);
  if (seen.has(key)) throw new Error(`duplicate seed key ${key}`);
  seen.add(key);
  if (adhKey) {
    const adhesive = await prisma.hardwareItem.findUnique({ where: { family_name_diameter_length_finish: adhKey } });
    data.adhesiveId = adhesive?.id ?? null;
  }
  const existing = await prisma.hardwareItem.findUnique({ where: { family_name_diameter_length_finish: uniq(data) } });
  if (!existing) {
    created++;
    if (!DRY) await prisma.hardwareItem.create({ data: { ...data, isDefault: false } });
    return;
  }
  // Admin-owned: isDefault, active, and any non-zero price.
  const patch = {};
  for (const f of ['kind', 'diameterIn', 'lengthIn', 'weightEach', 'bitDiaIn', 'embedMinIn', 'embedMaxIn', 'adhesiveId', 'cartridgeMl', 'sortOrder']) {
    if (data[f] !== undefined && (existing[f] ?? null) !== (data[f] ?? null)) patch[f] = data[f];
  }
  if (!existing.unitPrice && data.unitPrice) { patch.unitPrice = data.unitPrice; priced++; }
  if (Object.keys(patch).length === 0) { unchanged++; return; }
  updated++;
  if (!DRY) await prisma.hardwareItem.update({ where: { id: existing.id }, data: patch });
}

// Apply seed defaults only to families that have none.
async function applyDefaults() {
  for (const item of desired.filter(i => i.isDefault)) {
    const hasDefault = await prisma.hardwareItem.count({ where: { family: item.family, isDefault: true } });
    if (hasDefault) continue;
    console.log(`default: ${item.family} → ${item.diameter ? `${item.diameter}" x ${item.length}"` : item.name}`);
    if (!DRY) await prisma.hardwareItem.updateMany({ where: { ...uniq(item) }, data: { isDefault: true } });
  }
}

try {
  await fixups();
  for (const item of desired) await upsert(item);   // adhesives first so rods can link
  await applyDefaults();
  const total = await prisma.hardwareItem.count();
  const unpriced = await prisma.hardwareItem.count({ where: { unitPrice: 0 } });
  console.log(`${DRY ? '[dry-run] ' : ''}hardware catalog: ${created} created, ${updated} updated (${priced} priced from sheet), ${unchanged} unchanged (${desired.length} in seed, ${total} in DB, ${unpriced} still $0)`);
} finally {
  await prisma.$disconnect();
}
