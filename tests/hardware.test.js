// lib/hardware.js — hardware catalog helpers (labels, fraction parsing, ordering)

import { describe, it, expect } from 'vitest';
import { parseInches, formatInches, hardwareLabel, compareHardware, groupByFamily, defaultForFamily } from '../lib/hardware.js';

const item = (over = {}) => ({
  id: 1, kind: 'BOLT_SET', family: 'A325', diameter: '3/4', diameterIn: 0.75,
  length: '2', lengthIn: 2, finish: 'Plain', unitPrice: 0, weightEach: 0.63, isDefault: false, active: true, sortOrder: 10,
  ...over,
});

describe('parseInches / formatInches', () => {
  it('reads shop fractions', () => {
    expect(parseInches('2-1/2')).toBe(2.5);
    expect(parseInches('3/4')).toBe(0.75);
    expect(parseInches('2')).toBe(2);
    expect(parseInches('5 1/2"')).toBe(5.5);
    expect(parseInches('330 ml')).toBe(330);
    expect(parseInches('')).toBe(0);
    expect(parseInches(null)).toBe(0);
  });
  it('writes them back to the nearest sixteenth', () => {
    expect(formatInches(2.5)).toBe('2-1/2');
    expect(formatInches(0.75)).toBe('3/4');
    expect(formatInches(6)).toBe('6');
    expect(formatInches(4.375)).toBe('4-3/8');
    expect(formatInches(0)).toBe('');
  });
});

describe('hardwareLabel', () => {
  it('matches the hand-typed shop format', () => {
    expect(hardwareLabel(item())).toBe('3/4" A325 x 2"');
    expect(hardwareLabel(item({ family: 'Kwik Bolt', diameter: '1/2', length: '5-1/2', finish: 'Zinc' }))).toBe('1/2" Kwik Bolt x 5-1/2"');
  });
  it('shows a finish only when the family name does not already say it', () => {
    expect(hardwareLabel(item({ finish: 'HDG' }))).toBe('3/4" A325 x 2" HDG');
    expect(hardwareLabel(item({ family: 'HAS-B-105 HDG', finish: 'HDG', diameter: '1/2', length: '8' }))).toBe('1/2" HAS-B-105 HDG x 8"');
    expect(hardwareLabel(item({ finish: 'Zinc' }))).toBe('3/4" A325 x 2"');
  });
  it('labels adhesive by product name and cartridge', () => {
    expect(hardwareLabel(item({ kind: 'ADHESIVE', family: 'Adhesive', name: 'HIT-HY 200 V3', diameter: '', length: '330 ml' }))).toBe('HIT-HY 200 V3 330 ml');
    expect(hardwareLabel(item({ kind: 'ADHESIVE', family: 'Adhesive', name: '', diameter: '', length: '330 ml' }))).toBe('Adhesive 330 ml');
  });
});

describe('ordering and defaults', () => {
  const items = [
    item({ id: 1, diameter: '1', diameterIn: 1, length: '2', lengthIn: 2 }),
    item({ id: 2, diameter: '3/4', diameterIn: 0.75, length: '2-1/2', lengthIn: 2.5 }),
    item({ id: 3, diameter: '3/4', diameterIn: 0.75, length: '2', lengthIn: 2, isDefault: true }),
    item({ id: 4, family: 'Kwik Bolt', kind: 'EXPANSION_ANCHOR', sortOrder: 20, diameter: '1/2', diameterIn: 0.5, length: '5-1/2', lengthIn: 5.5 }),
    item({ id: 5, family: 'Kwik Bolt', kind: 'EXPANSION_ANCHOR', sortOrder: 20, diameter: '1/2', diameterIn: 0.5, length: '3-3/4', lengthIn: 3.75, active: false }),
  ];
  it('sorts family → diameter → length', () => {
    expect([...items].sort(compareHardware).map(i => i.id)).toEqual([3, 2, 1, 5, 4]);
  });
  it('groups by family in catalog order', () => {
    const g = groupByFamily(items);
    expect(g.map(f => f.family)).toEqual(['A325', 'Kwik Bolt']);
    expect(g[0].items.map(i => i.id)).toEqual([3, 2, 1]);
    expect(g[1].kind).toBe('EXPANSION_ANCHOR');
  });
  it('default is the flagged item, else the first active one', () => {
    expect(defaultForFamily(items, 'A325').id).toBe(3);
    expect(defaultForFamily(items, 'Kwik Bolt').id).toBe(4);   // 5 is inactive and would sort first
    expect(defaultForFamily(items, 'Nope')).toBeNull();
  });
});
