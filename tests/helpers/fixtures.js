// Fixture estimates for the characterization suite. Values are realistic
// (AISC weights, plausible $/lb and $/cwt) and deterministic. Materials are
// run through the REAL extracted calculateMaterial so fixtures hold exactly
// the state the app would hold.

import { makeCalculateMaterial } from './extract.js';

export const calculateMaterial = makeCalculateMaterial();

let nextId = 1000;
export const id = () => ++nextId;

// Deterministic PRNG for the large fixture
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mat(overrides = {}) {
  const base = {
    id: id(),
    sequence: 'A',
    parentMaterialId: null,
    description: '',
    category: 'W Shape',
    size: 'W12x26',
    customWeight: null,
    pieces: 1,
    length: 20,
    stockLength: null,
    priceBy: 'LB',
    unitPrice: 0,
    galvanized: false,
    fabrication: [],
    ...overrides,
  };
  return calculateMaterial(base);
}

// Attach an auto-galv fab line the way the UI does (quantity = fabWeight)
export function withGalv(material, galvRatePerLb) {
  const m = calculateMaterial({ ...material, galvanized: true });
  m.fabrication = [
    ...(m.fabrication || []),
    {
      id: id(),
      operation: 'Galvanizing',
      connectTo: 'apply',
      description: `Galv - ${m.description || m.size}`,
      quantity: m.fabWeight || 0,
      unit: 'LB',
      unitPrice: galvRatePerLb,
      multiplyByPieces: false,
      totalCost: (m.fabWeight || 0) * galvRatePerLb,
      isAutoGalv: true,
    },
  ];
  return m;
}

export function fab(overrides = {}) {
  const f = {
    id: id(),
    operation: 'Cut- Straight',
    quantity: 1,
    unit: 'EA',
    length: null,
    unitPrice: 0,
    connWeight: null,
    ...overrides,
  };
  if (f.totalCost === undefined) {
    if (f.connWeight && f.unit === 'LB') f.totalCost = (f.quantity || 0) * f.connWeight * (f.unitPrice || 0);
    else if ((f.unit === 'IN' || f.unit === 'LF') && f.length) f.totalCost = (f.quantity || 0) * (f.length || 0) * (f.unitPrice || 0);
    else f.totalCost = (f.quantity || 0) * (f.unitPrice || 0);
  }
  return f;
}

export function emptyRecap() {
  return {
    installation: { cost: 0, markup: 0, total: 0 },
    drafting: { cost: 0, markup: 0, total: 0 },
    engineering: { cost: 0, markup: 0, total: 0 },
    projectManagement: { hours: 0, rate: 60, total: 0 },
    shipping: { cost: 0, markup: 0, total: 0 },
  };
}

export function recap({ installation = [0, 0], drafting = [0, 0], engineering = [0, 0], pm = [0, 60], shipping = [0, 0] } = {}) {
  const cm = ([cost, markup]) => ({ cost, markup, total: cost + (cost * markup) / 100 });
  return {
    installation: cm(installation),
    drafting: cm(drafting),
    engineering: cm(engineering),
    projectManagement: { hours: pm[0], rate: pm[1], total: pm[0] * pm[1] },
    shipping: cm(shipping),
  };
}

export function item(overrides = {}) {
  return {
    id: id(),
    itemNumber: '001',
    itemName: 'Fixture Item',
    drawingRef: '',
    materialMarkup: 0,
    fabMarkup: 0,
    breakoutGroupId: null,
    materials: [],
    fabrication: [],
    recapCosts: emptyRecap(),
    snapshots: [],
    ...overrides,
  };
}

// ── Standard fixture: exercises the full feature surface ────────────────────
export function standardFixture() {
  // Item 1 — structural framing with markups, fab ops, recap, galv, child
  const beam = mat({ size: 'W12x26', category: 'W Shape', pieces: 4, length: 32, priceBy: 'LB', unitPrice: 0.85 });
  beam.fabrication = [
    fab({ operation: 'WF Connx', quantity: 2, unit: 'EA', unitPrice: 85, connWeight: 30 }),           // 2 × 85 = 170
    fab({ operation: 'Apply- Fillet Weld', quantity: 2, unit: 'IN', length: 8, unitPrice: 1.25 }),        // 2 × 8 × 1.25 = 20
  ];
  const childPlate = mat({
    parentMaterialId: beam.id, sequence: 'Aa', category: 'Plate',
    plateThickness: 0.5, plateWidth: 6, size: '', pieces: 4, inheritPieces: true,
    length: 1, priceBy: 'LB', unitPrice: 0.62,
  });
  const channel = mat({ size: 'C15x33.9', category: 'Channel', pieces: 3, length: 17.67, priceBy: 'LF', unitPrice: 34.25 });
  const cwtBeam = mat({ size: 'W18x35', category: 'W Shape', pieces: 2, length: 28.08, priceBy: 'CWT', unitPrice: 47.85 });
  const galvBeam = withGalv(
    mat({ size: 'W16x26', category: 'W Shape', pieces: 2, length: 24, priceBy: 'LB', unitPrice: 0.85 }),
    0.28
  );

  const item1 = item({
    itemNumber: '001', itemName: 'STRUCTURAL FRAMING',
    materialMarkup: 12, fabMarkup: 8,
    materials: [beam, childPlate, channel, cwtBeam, galvBeam],
    fabrication: [fab({ operation: 'Handling', quantity: 1, unit: 'LS', unitPrice: 250 })],
    recapCosts: recap({ installation: [1000, 10], pm: [8, 60] }),
  });

  // Item 2 — misc: EA pricing, plates with/without dims, custom weight,
  // over-length piece, remnant-y stock optimization, no markups
  const angleEA = mat({ size: 'L3x3x1/4', category: 'Angle', pieces: 6, length: 10, priceBy: 'EA', unitPrice: 45 });
  const plateWithDims = mat({ category: 'Plate', plateThickness: 0.5, plateWidth: 6, size: '', pieces: 4, length: 2, priceBy: 'LB', unitPrice: 0.62 });
  const plateNoDims = mat({ category: 'Plate', size: 'PL 1/2 x 6', pieces: 2, length: 3, priceBy: 'LB', unitPrice: 0.62 }); // no thickness/width → zero weight path
  const customLine = mat({ category: 'Custom', size: 'BENT PL 10GA', customWeight: 12.5, pieces: 5, length: 8, priceBy: 'LB', unitPrice: 0.9 });
  const overLength = mat({ size: 'W21x44', category: 'W Shape', pieces: 1, length: 62, priceBy: 'LB', unitPrice: 0.85 }); // longer than 60' max
  const remnant = mat({ size: 'HSS4x4x1/4', category: 'HSS Square', pieces: 3, length: 7, priceBy: 'LB', unitPrice: 1.1 }); // 3 × 7' on 24' stick, 3' drop
  const manualStock = mat({ size: 'W10x12', category: 'W Shape', pieces: 2, length: 18, stockLength: 45, priceBy: 'LB', unitPrice: 0.85 }); // manual override

  const item2 = item({
    itemNumber: '002', itemName: 'MISC METALS',
    materials: [angleEA, plateWithDims, plateNoDims, customLine, overLength, remnant, manualStock],
  });

  const adjustments = [
    { id: id(), description: 'GC discount', amount: -500 },
    { id: id(), description: 'Fuel surcharge', amount: 125.5 },
  ];

  return { items: [item1, item2], adjustments };
}

// ── Breakout fixture: base / deduct / add groups ─────────────────────────────
export function breakoutFixture() {
  const groups = [
    { id: 9001, name: 'Base', type: 'base' },
    { id: 9002, name: 'Canopy (deduct)', type: 'deduct' },
    { id: 9003, name: 'Extra stairs (add)', type: 'add' },
  ];
  const baseItem = item({
    itemNumber: '001', breakoutGroupId: 9001, materialMarkup: 10,
    materials: [mat({ size: 'W12x26', pieces: 2, length: 30, priceBy: 'LB', unitPrice: 0.85 })],
  });
  const ungrouped = item({
    itemNumber: '002',
    materials: [mat({ size: 'W16x26', pieces: 1, length: 24, priceBy: 'LB', unitPrice: 0.85 })],
  });
  const deductItem = item({
    itemNumber: '003', breakoutGroupId: 9002,
    materials: [mat({ size: 'C15x33.9', category: 'Channel', pieces: 2, length: 16, priceBy: 'LB', unitPrice: 1.05 })],
  });
  const addItem = item({
    itemNumber: '004', breakoutGroupId: 9003,
    materials: [mat({ size: 'HSS6x6x3/8', category: 'HSS Square', pieces: 4, length: 18, priceBy: 'LB', unitPrice: 1.15 })],
  });
  const adjustments = [{ id: id(), description: 'internal adj', amount: 750 }];
  return { items: [baseItem, ungrouped, deductItem, addItem], breakoutGroups: groups, adjustments };
}

// ── Large fixture: 30 items × 11 materials = 330 lines ──────────────────────
const BIG_SIZES = [
  ['W8x10', 'W Shape'], ['W12x26', 'W Shape'], ['W16x26', 'W Shape'], ['W18x35', 'W Shape'],
  ['W21x44', 'W Shape'], ['W24x68', 'W Shape'], ['C15x33.9', 'Channel'], ['MC18x42.7', 'MC Channel'],
  ['L3x3x1/4', 'Angle'], ['L4x4x3/8', 'Angle'], ['HSS4x4x1/4', 'HSS Square'], ['HSS6x6x3/8', 'HSS Square'],
  ['HSS8x6x1/2', 'HSS Rect'], ['PIPE 4 STD', 'Pipe'],
];
const BIG_PRICE_BY = ['LB', 'LB', 'LB', 'LF', 'EA', 'CWT'];

export function bigFixture() {
  const rand = mulberry32(20260708);
  const items = [];
  for (let i = 0; i < 30; i++) {
    const materials = [];
    for (let j = 0; j < 11; j++) {
      const [size, category] = BIG_SIZES[Math.floor(rand() * BIG_SIZES.length)];
      const priceBy = BIG_PRICE_BY[Math.floor(rand() * BIG_PRICE_BY.length)];
      const pieces = 1 + Math.floor(rand() * 12);
      const length = Math.round((4 + rand() * 40) * 100) / 100;
      const unitPrice = priceBy === 'CWT'
        ? Math.round((40 + rand() * 25) * 100) / 100
        : priceBy === 'LF'
          ? Math.round((8 + rand() * 40) * 100) / 100
          : priceBy === 'EA'
            ? Math.round((30 + rand() * 200) * 100) / 100
            : Math.round((0.6 + rand() * 0.7) * 10000) / 10000;
      let m = mat({ size, category, pieces, length, priceBy, unitPrice });
      if (rand() < 0.15) m = withGalv(m, 0.28);
      if (rand() < 0.3) {
        m.fabrication = [
          ...(m.fabrication || []),
          fab({ operation: 'Drill Holes', quantity: 2 + Math.floor(rand() * 6), unit: 'EA', unitPrice: Math.round(rand() * 8 * 100) / 100 }),
        ];
      }
      materials.push(m);
    }
    items.push(item({
      itemNumber: String(i + 1).padStart(3, '0'),
      itemName: `BIG FIXTURE ITEM ${i + 1}`,
      materialMarkup: [0, 5, 10, 12][i % 4],
      fabMarkup: [0, 8][i % 2],
      materials,
      fabrication: i % 3 === 0 ? [fab({ operation: 'Shop Load-out', quantity: 1, unit: 'LS', unitPrice: 350 })] : [],
      recapCosts: i % 5 === 0 ? recap({ installation: [2000, 15], pm: [10, 65] }) : emptyRecap(),
    }));
  }
  const adjustments = [{ id: id(), description: 'big adj', amount: -1250.75 }];
  return { items, adjustments };
}
