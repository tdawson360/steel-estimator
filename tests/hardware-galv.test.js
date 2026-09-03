// Galvanized hardware is bought that way: it never dips, never joins a galv
// group, and its Galv flag only swaps the catalog price to the HDG variant.

import { describe, it, expect } from 'vitest';
import { normalizeGalvLines, galvLineQty, isCoveredByParent, dipsInKettle } from '../lib/estimating/galv.js';
import { hardwareFinishVariant } from '../lib/hardware.js';

const beam = { id: 1, parentMaterialId: null, category: 'W Shape', size: 'W12x26', description: 'BEAM', galvanized: true, fabWeight: 520, fabrication: [] };
const clip = { id: 2, parentMaterialId: 1, category: 'Angle', size: 'L3x3x1/4', galvanized: true, fabWeight: 12, fabrication: [] };
const bolts = { id: 3, parentMaterialId: 1, category: 'Hardware', size: '3/4" A325 x 2"', galvanized: true, fabWeight: 7.6, fabrication: [] };

describe('hardware and galvanizing', () => {
  it('a galvanized hardware child adds nothing to the parent dip', () => {
    expect(dipsInKettle(bolts)).toBe(false);
    expect(dipsInKettle(clip)).toBe(true);
    expect(isCoveredByParent(bolts, [beam, clip, bolts])).toBe(false);
    expect(galvLineQty(beam, [beam, clip, bolts])).toBe(532);   // beam + clip, no bolts
  });

  it('normalizeGalvLines gives hardware no galv line and does not count it as an attachment', () => {
    const out = normalizeGalvLines([beam, clip, bolts]);
    const beamGalv = out[0].fabrication.find(f => f.isAutoGalv);
    expect(beamGalv.quantity).toBe(532);
    expect(beamGalv.description).toBe('Galv - BEAM + attachments');
    expect(out[2].fabrication.some(f => f.isAutoGalv)).toBe(false);
    // a galvanized hardware PARENT gets no line either
    const loose = normalizeGalvLines([{ ...bolts, id: 9, parentMaterialId: null }]);
    expect(loose[0].fabrication.some(f => f.isAutoGalv)).toBe(false);
    // and the "+ attachments" suffix drops when bolts are the only child
    const only = normalizeGalvLines([beam, bolts]);
    expect(only[0].fabrication.find(f => f.isAutoGalv).description).toBe('Galv - BEAM');
  });
});

describe('hardwareFinishVariant', () => {
  const plain = { id: 10, family: 'A325', name: '', diameter: '3/4', length: '2', finish: 'Plain', unitPrice: 3.1, active: true };
  const hdg = { id: 11, family: 'A325', name: '', diameter: '3/4', length: '2', finish: 'HDG', unitPrice: 3.9, active: true };
  const hdgUnpriced = { ...hdg, id: 12, unitPrice: 0 };
  const other = { ...hdg, id: 13, length: '2-1/2' };

  it('finds the priced HDG twin and the way back', () => {
    expect(hardwareFinishVariant([plain, hdg, other], plain, true)?.id).toBe(11);
    expect(hardwareFinishVariant([plain, hdg, other], hdg, false)?.id).toBe(10);
  });
  it('returns null when there is no priced variant or nothing to change', () => {
    expect(hardwareFinishVariant([plain, hdgUnpriced], plain, true)).toBeNull();   // HDG exists but $0
    expect(hardwareFinishVariant([plain], plain, true)).toBeNull();
    expect(hardwareFinishVariant([plain, hdg], plain, false)).toBeNull();          // already plain
    expect(hardwareFinishVariant([plain, hdg], hdg, true)).toBeNull();             // already HDG
    expect(hardwareFinishVariant([plain, hdg], null, true)).toBeNull();
  });
});
