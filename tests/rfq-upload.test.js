// Characterization: RFQ vendor-CSV pricing upload — parsing, unit priority,
// size-only weighted-average fallback, and application to material lines.
// Closes the last untested money path before extraction (Session B, Step 0).

import { describe, it, expect } from 'vitest';
import { makeRfqUpload } from './helpers/extract.js';
import { calculateMaterial, item, mat } from './helpers/fixtures.js';

const HEADER = 'Size,Stock Length,Quantity,Weight/Ft,Est Total Weight,Your $/CWT,Your $/LB,Your $/LF,Your $/EA,Your Total,Lead Time,Notes';
const csv = (rows) => ['RFQ export junk line', HEADER, ...rows, 'TOTALS,,,,999'].join('\n');

const round2 = (v) => Math.round(v * 100) / 100;

function fixtureItems() {
  return [item({
    itemNumber: '001',
    materials: [
      // W12x26 standalone: 4 × 32' → stockLength 35 (matches vendor row exactly)
      mat({ size: 'W12x26', category: 'W Shape', pieces: 4, length: 32, priceBy: 'LB', unitPrice: 0 }),
      // W18x35 line whose OWN stockLength (30) differs from the vendor's stick rows
      mat({ size: 'W18x35', category: 'W Shape', pieces: 2, length: 28.08, priceBy: 'LB', unitPrice: 0 }),
      // C15x33.9 untouched by vendor sheet
      mat({ size: 'C15x33.9', category: 'Channel', pieces: 2, length: 16, priceBy: 'LB', unitPrice: 0 }),
    ],
  })];
}

describe('single vendor row per size', () => {
  it('applies $/LB pricing to exact size+stockLength matches', () => {
    const rfq = makeRfqUpload(fixtureItems(), calculateMaterial);
    rfq.upload(csv(['W12x26,35,4,26.00,3640,,0.85,,,,,']));
    const m = rfq.getState()[0].materials[0];
    expect(m.priceBy).toBe('LB');
    expect(m.unitPrice).toBe(0.85);
    expect(round2(m.totalCost)).toBe(3094); // 3640 stock lbs × 0.85
    expect(rfq.getResult()).toEqual({ matched: 1, total: 1, unmatched: [] });
  });

  it('CWT column wins over $/LB when both filled', () => {
    const rfq = makeRfqUpload(fixtureItems(), calculateMaterial);
    rfq.upload(csv(['W12x26,35,4,26.00,3640,47.85,0.85,,,,,']));
    const m = rfq.getState()[0].materials[0];
    expect(m.priceBy).toBe('CWT');
    expect(m.unitPrice).toBe(47.85);
    expect(round2(m.totalCost)).toBe(round2((3640 / 100) * 47.85));
  });

  it('$/LF and $/EA fall through in priority order', () => {
    const rfq = makeRfqUpload(fixtureItems(), calculateMaterial);
    rfq.upload(csv(['W12x26,35,4,26.00,3640,,,42.50,,,,']));
    const m = rfq.getState()[0].materials[0];
    expect(m.priceBy).toBe('LF');
    expect(m.unitPrice).toBe(42.5);
    expect(round2(m.totalCost)).toBe(round2(4 * 35 * 42.5)); // stocks × stick × $/ft
  });
});

describe('size-only fallback with weighted average', () => {
  it('material stockLength ≠ vendor stick lengths → weighted average of that size', () => {
    // Vendor quotes W18x35 as 60' sticks at 0.80 and 40' sticks at 0.90.
    // Weights: qty × stockLen × wpf → (1×60×35)=2100 and (2×40×35)=2800.
    // Weighted avg = (0.80×2100 + 0.90×2800) / 4900 = 0.857142857…
    const rfq = makeRfqUpload(fixtureItems(), calculateMaterial);
    rfq.upload(csv([
      'W18x35,60,1,35.00,2100,,0.80,,,,,',
      'W18x35,40,2,35.00,2800,,0.90,,,,,',
    ]));
    const m = rfq.getState()[0].materials[1];
    expect(m.priceBy).toBe('LB');
    expect(m.unitPrice).toBeCloseTo((0.8 * 2100 + 0.9 * 2800) / 4900, 10);
    // both vendor rows count as matched via the size fallback
    expect(rfq.getResult().matched).toBe(2);
    expect(rfq.getResult().total).toBe(2);
  });

  it('exact size+stockLength match beats the size-average', () => {
    const items = fixtureItems();
    const rfq = makeRfqUpload(items, calculateMaterial);
    // W12x26 line has stockLength 35; vendor quotes 35s AND 60s at different rates
    rfq.upload(csv([
      'W12x26,35,4,26.00,3640,,0.85,,,,,',
      'W12x26,60,1,26.00,1560,,0.70,,,,,',
    ]));
    const m = rfq.getState()[0].materials[0];
    expect(m.unitPrice).toBe(0.85); // exact 35' row, not the 0.806 blended average
  });

  it('zero/blank Quantity rows weight as ONE stick in the average', () => {
    // qty parses as (parseFloat || 1): a zero/blank qty row still contributes
    // 1 × stockLen × wpf of weight to the blend. Frozen as-is.
    const rfq = makeRfqUpload(fixtureItems(), calculateMaterial);
    rfq.upload(csv([
      'W18x35,60,,35.00,2100,,0.80,,,,,',
      'W18x35,40,2,35.00,2800,,0.90,,,,,',
    ]));
    const m = rfq.getState()[0].materials[1];
    const w60 = 1 * 60 * 35, w40 = 2 * 40 * 35;
    expect(m.unitPrice).toBeCloseTo((0.8 * w60 + 0.9 * w40) / (w60 + w40), 10);
  });

  it('mixed price bases across rows of one size: first row basis wins the average', () => {
    // Row 1 quotes $/LB, row 2 quotes $/LF. sizeAgg only accumulates rows whose
    // basis matches the first seen; the LF row is excluded from the blend but
    // still counts in the pricing map. Frozen as-is.
    const rfq = makeRfqUpload(fixtureItems(), calculateMaterial);
    rfq.upload(csv([
      'W18x35,60,1,35.00,2100,,0.80,,,,,',
      'W18x35,40,2,35.00,2800,,,42.00,,,,',
    ]));
    const m = rfq.getState()[0].materials[1];
    expect(m.priceBy).toBe('LB');
    expect(m.unitPrice).toBeCloseTo(0.8, 10);
  });
});

describe('reporting and non-matches', () => {
  it('vendor rows with no matching size are reported unmatched', () => {
    const rfq = makeRfqUpload(fixtureItems(), calculateMaterial);
    rfq.upload(csv([
      'W12x26,35,4,26.00,3640,,0.85,,,,,',
      'HSS9x9x5/8,40,2,66.00,5280,,1.20,,,,,',
    ]));
    expect(rfq.getResult().matched).toBe(1);
    expect(rfq.getResult().total).toBe(2);
    expect(rfq.getResult().unmatched).toEqual(['HSS9x9x5/8']);
    // untouched line keeps zero pricing
    expect(rfq.getState()[0].materials[2].unitPrice).toBe(0);
  });

  it('rows without any price are ignored; all-empty sheet errors', () => {
    const rfq = makeRfqUpload(fixtureItems(), calculateMaterial);
    rfq.upload(csv(['W12x26,35,4,26.00,3640,,,,,,,']));
    expect(rfq.getResult().error).toMatch(/No pricing found/);
  });

  it('sheet without a Size header errors', () => {
    const rfq = makeRfqUpload(fixtureItems(), calculateMaterial);
    rfq.upload('Nope,Nada\n1,2');
    expect(rfq.getResult().error).toMatch(/Could not find data rows/);
  });
});
