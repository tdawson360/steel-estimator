'use server';
import { NextResponse } from 'next/server';

// Sample data that mirrors the real SteelEstimator data shape
const SAMPLE_ITEMS = [
  {
    id: 1,
    itemNumber: '001',
    itemName: 'STRUCTURAL FRAMING',
    drawingRef: 'S-502',
    breakoutGroupId: null,
    materialMarkup: 10,
    fabMarkup: 5,
    materials: [
      {
        id: 101,
        parentMaterialId: null,
        sequence: 'A',
        description: 'Main Beam',
        category: 'Wide Flange',
        size: 'W 16 x 26',
        pieces: 1,
        quantity: 1,
        length: 57.17,
        weightPerFoot: 26,
        fabWeight: 1486,
        stockLength: 60,
        stocksRequired: 1,
        unitPrice: 0.62,
        totalCost: 921.32,
        priceBy: 'LB',
        isAutoGalv: false,
        isConnGalv: false,
        fabrication: [
          { id: 201, operation: 'Cut- Straight', qty: 2, unit: 'EA', rate: 15, totalCost: 30, isAutoGalv: false, isConnGalv: false },
          { id: 202, operation: 'Drill Holes', qty: 4, unit: 'EA', rate: 8, totalCost: 32, isAutoGalv: false, isConnGalv: false },
          { id: 203, operation: 'WF Connx', qty: 2, unit: 'EA', rate: 145, totalCost: 290, isAutoGalv: false, isConnGalv: false },
        ],
      },
      {
        id: 102,
        parentMaterialId: 101,
        sequence: 'A.1',
        description: 'Clip Angle',
        category: 'Angle',
        size: 'L 3 x 3 x 1/4',
        pieces: 2,
        quantity: 2,
        length: 0.75,
        weightPerFoot: 4.1,
        fabWeight: 6.15,
        stockLength: 20,
        stocksRequired: 1,
        unitPrice: 0.65,
        totalCost: 4.00,
        priceBy: 'LB',
        isAutoGalv: false,
        isConnGalv: false,
        fabrication: [
          { id: 211, operation: 'Cut- Straight', qty: 2, unit: 'EA', rate: 15, totalCost: 30, isAutoGalv: false, isConnGalv: false },
          { id: 212, operation: 'Drill Holes', qty: 3, unit: 'EA', rate: 8, totalCost: 24, isAutoGalv: false, isConnGalv: false },
          { id: 213, operation: 'Welding- Fillet', qty: 1, unit: 'EA', rate: 35, totalCost: 35, isAutoGalv: false, isConnGalv: false },
        ],
      },
      {
        id: 103,
        parentMaterialId: 101,
        sequence: 'A.2',
        description: 'End Plate',
        category: 'Plate',
        size: 'PL 3/8 x 6',
        pieces: 1,
        quantity: 1,
        length: 0.83,
        weightPerFoot: 7.65,
        fabWeight: 6.35,
        stockLength: 10,
        stocksRequired: 1,
        unitPrice: 0.68,
        totalCost: 4.32,
        priceBy: 'LB',
        isAutoGalv: false,
        isConnGalv: false,
        fabrication: [
          { id: 221, operation: 'Drill Holes', qty: 4, unit: 'EA', rate: 8, totalCost: 32, isAutoGalv: false, isConnGalv: false },
          { id: 222, operation: 'Welding- Fillet', qty: 1, unit: 'EA', rate: 35, totalCost: 35, isAutoGalv: false, isConnGalv: false },
        ],
      },
    ],
    fabrication: [
      { id: 301, operation: 'Prime Paint', qty: 1, unit: 'EA', rate: 95, totalCost: 95, isAutoGalv: false, isConnGalv: false },
    ],
    recapCosts: {
      installation: { cost: 2500, markup: 0, total: 2500 },
      drafting: { cost: 400, markup: 0, total: 400 },
      engineering: { cost: 0, markup: 0, total: 0 },
      projectManagement: { hours: 4, rate: 60, total: 240 },
      shipping: { cost: 350, markup: 0, total: 350 },
    },
  },
  {
    id: 2,
    itemNumber: '002',
    itemName: 'CANOPY SUPPORT FRAMING',
    drawingRef: 'S-100',
    breakoutGroupId: null,
    materialMarkup: 10,
    fabMarkup: 5,
    materials: [
      {
        id: 111,
        parentMaterialId: null,
        sequence: 'A',
        description: 'Column',
        category: 'Wide Flange',
        size: 'W 8 x 21',
        pieces: 1,
        quantity: 1,
        length: 24.75,
        weightPerFoot: 21,
        fabWeight: 519.75,
        stockLength: 30,
        stocksRequired: 1,
        unitPrice: 0.62,
        totalCost: 322.25,
        priceBy: 'LB',
        isAutoGalv: false,
        isConnGalv: false,
        fabrication: [
          { id: 231, operation: 'Cut- Straight', qty: 1, unit: 'EA', rate: 15, totalCost: 15, isAutoGalv: false, isConnGalv: false },
          { id: 232, operation: 'Cut- Single Cope End', qty: 1, unit: 'EA', rate: 28, totalCost: 28, isAutoGalv: false, isConnGalv: false },
          { id: 233, operation: 'Custom', customOperation: 'Kicker Brace Prep', qty: 1, unit: 'EA', rate: 45, totalCost: 45, isAutoGalv: false, isConnGalv: false },
        ],
      },
      {
        id: 112,
        parentMaterialId: null,
        sequence: 'B',
        description: 'Horizontal Tube',
        category: 'HSS',
        size: 'HSS 4 x 4 x 1/4',
        pieces: 2,
        quantity: 2,
        length: 3.58,
        weightPerFoot: 12.21,
        fabWeight: 87.4,
        stockLength: 20,
        stocksRequired: 1,
        unitPrice: 0.75,
        totalCost: 65.55,
        priceBy: 'LB',
        isAutoGalv: false,
        isConnGalv: false,
        fabrication: [
          { id: 241, operation: 'Cut- Miter', qty: 2, unit: 'EA', rate: 22, totalCost: 44, isAutoGalv: false, isConnGalv: false },
          { id: 242, operation: 'Welding- CJP', qty: 1, unit: 'EA', rate: 85, totalCost: 85, isAutoGalv: false, isConnGalv: false },
        ],
      },
    ],
    fabrication: [
      { id: 311, operation: 'Blast & Prime', qty: 1, unit: 'EA', rate: 140, totalCost: 140, isAutoGalv: false, isConnGalv: false },
    ],
    recapCosts: {
      installation: { cost: 1200, markup: 0, total: 1200 },
      drafting: { cost: 200, markup: 0, total: 200 },
      engineering: { cost: 150, markup: 0, total: 150 },
      projectManagement: { hours: 2, rate: 60, total: 120 },
      shipping: { cost: 200, markup: 0, total: 200 },
    },
  },
];

// Compute totals from sample items
function buildTotals(items) {
  let totalMat = 0, totalFab = 0, totalMatMarkup = 0, totalFabMarkup = 0, totalRecap = 0;
  items.forEach(item => {
    const mat = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
    const fab = item.materials.reduce((s, m) => s + (m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0), 0)
              + item.fabrication.reduce((fs, f) => fs + (f.totalCost || 0), 0);
    const recap = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
    totalMat += mat;
    totalFab += fab;
    totalMatMarkup += mat * (item.materialMarkup || 0) / 100;
    totalFabMarkup += fab * (item.fabMarkup || 0) / 100;
    totalRecap += recap;
  });
  const subtotal = totalMat + totalFab + totalMatMarkup + totalFabMarkup + totalRecap;
  return {
    totalMaterialCost: totalMat,
    totalFabricationCost: totalFab,
    totalMaterialMarkup: totalMatMarkup,
    totalFabMarkup: totalFabMarkup,
    totalMarkup: totalMatMarkup + totalFabMarkup,
    totalRecapCosts: totalRecap,
    totalTax: 0,
    totalAdjustments: 0,
    subtotal,
    grandTotal: subtotal,
  };
}

function buildBreakoutTotals(items) {
  const baseBid = items.reduce((s, item) => {
    const mat = item.materials.reduce((ms, m) => ms + (m.totalCost || 0), 0);
    const fab = item.materials.reduce((ms, m) => ms + (m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0), 0)
              + item.fabrication.reduce((fs, f) => fs + (f.totalCost || 0), 0);
    const recap = Object.values(item.recapCosts).reduce((rs, c) => rs + (c.total || 0), 0);
    return s + mat * (1 + (item.materialMarkup || 0) / 100) + fab * (1 + (item.fabMarkup || 0) / 100) + recap;
  }, 0);
  return { baseBid, deducts: [], adds: [] };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'erector'; // 'erector' or 'jobfolder'

  try {
    const { pdf } = await import('@react-pdf/renderer');
    const React = (await import('react')).default;

    const items = SAMPLE_ITEMS;
    const totals = buildTotals(items);
    const breakoutTotals = buildBreakoutTotals(items);

    let doc;
    if (type === 'jobfolder') {
      const { JobFolderPdf } = await import('../../../components/pdf/JobFolderPdf');
      doc = React.createElement(JobFolderPdf, {
        logo: null,
        projectName: 'Rothko Building — Test Export',
        projectAddress: '1234 Main St, Houston TX 77001',
        customerName: 'Acme General Contractors',
        billingAddress: '500 Commerce Blvd, Houston TX 77002',
        customerContact: 'Jane Smith',
        customerPhone: '713-555-0100',
        customerEmail: 'jsmith@acmegc.com',
        estimateDate: '2026-02-22',
        estimatedBy: 'Todd Dawson',
        drawingDate: '2026-01-15',
        drawingRevision: 'Rev 2',
        architect: 'Smith & Jones Architects',
        projectTypes: { structural: true, miscellaneous: false, ornamental: false },
        deliveryOptions: { installed: false, fobJobsite: true, willCall: false },
        taxCategory: null,
        items,
        breakoutTotals,
        selectedExclusions: ['Bond/Tax', 'Engineering/Shop Drawings', 'Inspections/Permits of any kind'],
        customExclusions: [],
        selectedQualifications: ['Proposal valid for 30 days', 'Steel pricing subject to mill confirmation'],
        customQualifications: [],
        customRecapColumns: [],
        totals,
      });
    } else {
      const { ErectorScopePdf } = await import('../../../components/pdf/ErectorScopePdf');
      doc = React.createElement(ErectorScopePdf, {
        logo: null,
        projectName: 'Rothko Building — Test Export',
        projectAddress: '1234 Main St, Houston TX 77001',
        drawingRevision: 'Rev 2',
        estimateDate: '2026-02-22',
        estimatedBy: 'Todd Dawson',
        items,
      });
    }

    const blob = await pdf(doc).toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filename = type === 'jobfolder' ? 'JobFolder_test.pdf' : 'ErectorScope_test.pdf';
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'X-PDF-Size-Bytes': buffer.length.toString(),
        'X-PDF-Type': type,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}
