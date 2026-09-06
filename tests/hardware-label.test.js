// Hardware catalog labels typed or auto-written into a takeoff's Shape_Size
// import as priced Hardware rows (lib/hardware.js matchHardwareLabel +
// import-takeoff annotateHardware).

import { describe, it, expect } from 'vitest';
import { matchHardwareLabel, normalizeHardwareText, hardwareLabel } from '../lib/hardware.js';
import { annotateHardware } from '../lib/estimating/import-takeoff.js';

const rod = (over) => ({
  id: 1, kind: 'ANCHOR_ROD', family: 'F1554 Gr55', name: '', diameter: '3/4', diameterIn: 0.75,
  length: '18', lengthIn: 18, finish: 'Plain', unitPrice: 12.5, weightEach: 2.9, active: true, sortOrder: 37,
  ...over,
});
const catalog = [
  rod({ id: 1 }),
  rod({ id: 2, finish: 'HDG', unitPrice: 15 }),
  rod({ id: 3, length: '24', lengthIn: 24 }),
  rod({ id: 4, family: 'F1554 Gr36', sortOrder: 35 }),
  { id: 5, kind: 'EXPANSION_ANCHOR', family: 'Kwik Bolt', name: '', diameter: '1/2', diameterIn: 0.5,
    length: '5-1/2', lengthIn: 5.5, finish: 'Zinc', unitPrice: 2.1, weightEach: 0.2, active: true, sortOrder: 20 },
  { id: 6, kind: 'BOLT_SET', family: 'A325', name: '', diameter: '3/4', diameterIn: 0.75,
    length: '2', lengthIn: 2, finish: 'Plain', unitPrice: 1.26, weightEach: 0.52, active: true, sortOrder: 10 },
  rod({ id: 7, family: 'F1554 Gr50', active: false, sortOrder: 36 }),
];

describe('matchHardwareLabel', () => {
  it('matches the catalog label exactly as hardwareLabel writes it', () => {
    expect(matchHardwareLabel(hardwareLabel(catalog[0]), catalog)?.id).toBe(1);
    expect(matchHardwareLabel(hardwareLabel(catalog[4]), catalog)?.id).toBe(5);
    expect(matchHardwareLabel('3/4" A325 x 2"', catalog)?.id).toBe(6);
  });
  it('is forgiving about quotes, case, spacing and token order', () => {
    expect(matchHardwareLabel('3/4 F1554 GR55 X 18', catalog)?.id).toBe(1);
    expect(matchHardwareLabel('F1554 Gr55 3/4" x 18"', catalog)?.id).toBe(1);
    expect(matchHardwareLabel('3/4" dia F1554 Gr55 x 18"', catalog)?.id).toBe(1);
  });
  it('picks the HDG variant for a galvanized row or an HDG/galv word, else plain', () => {
    expect(matchHardwareLabel('3/4" F1554 Gr55 x 18" HDG', catalog)?.id).toBe(2);
    expect(matchHardwareLabel('3/4" F1554 Gr55 x 18" galv', catalog)?.id).toBe(2);
    expect(matchHardwareLabel('3/4" F1554 Gr55 x 18"', catalog, { galvanized: true })?.id).toBe(2);
    expect(matchHardwareLabel('3/4" F1554 Gr55 x 24"', catalog, { galvanized: true })?.id).toBe(3); // no HDG 24": plain
  });
  it('never matches a steel shape, a different grade/length, or an inactive item', () => {
    expect(matchHardwareLabel('W 8 x 21', catalog)).toBeNull();
    expect(matchHardwareLabel('3/4" F1554 Gr55 x 36"', catalog)).toBeNull();
    expect(matchHardwareLabel('3/4" F1554 Gr50 x 18"', catalog)).toBeNull();
    expect(matchHardwareLabel('', catalog)).toBeNull();
  });
  it('normalizes typographic quotes and the diameter sign', () => {
    expect(normalizeHardwareText('3/4″ F1554 Gr55 × 18″')).toBe('3/4 f1554 gr55 x 18');
  });
});

describe('annotateHardware (import)', () => {
  const member = (over) => ({ mark: 'C7', isParent: true, base: 'C7', description: '', size: 'HSS6x6x3/8', length: 18.3, pieces: 1,
    galvanized: false, fabrication: [{ operation: 'Straight Cut', quantity: 1 }], children: [], ...over });
  it('turns a catalog label into a hardware member with no fab ops, priced from the catalog', () => {
    const items = [{ itemNumber: '1', members: [member({ size: '3/4" F1554 Gr55 x 18"', pieces: 4, mark: '1-5' })] }];
    expect(annotateHardware(items, catalog)).toBe(1);
    const m = items[0].members[0];
    expect(m.hardware).toMatchObject({ id: 1, label: '3/4" F1554 Gr55 x 18"', unitPrice: 12.5, weightEach: 2.9, lengthIn: 18 });
    expect(m.fabrication).toEqual([]);
  });
  it('promotes a nested hardware child to a top-level member (hardware never nests)', () => {
    const child = member({ mark: 'C7.2', isParent: false, size: '3/4" F1554 Gr55 x 18"', pieces: 4 });
    const parent = member({ children: [child] });
    const items = [{ itemNumber: '1', members: [parent] }];
    annotateHardware(items, catalog);
    expect(parent.children).toEqual([]);
    expect(items[0].members).toHaveLength(2);
    expect(items[0].members[1].hardware.id).toBe(1);
    expect(items[0].members[1].isParent).toBe(true);
  });
  it('leaves steel shapes and unknown sizes alone', () => {
    const items = [{ itemNumber: '1', members: [member(), member({ size: 'PL 1 x 14' }), member({ size: 'MYSTERY BRACKET' })] }];
    expect(annotateHardware(items, catalog)).toBe(0);
    expect(items[0].members.every(m => !m.hardware)).toBe(true);
  });
  it('a galvanized row takes the HDG catalog variant', () => {
    const items = [{ itemNumber: '1', members: [member({ size: '3/4" F1554 Gr55 x 18"', galvanized: true })] }];
    annotateHardware(items, catalog);
    expect(items[0].members[0].hardware).toMatchObject({ id: 2, finish: 'HDG', unitPrice: 15 });
  });
});
