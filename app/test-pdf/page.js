'use client';
import { useState } from 'react';

const SAMPLE_ITEMS = [
  {
    id: 1, itemNumber: '001', itemName: 'STRUCTURAL FRAMING', drawingRef: 'S-502',
    breakoutGroupId: null, materialMarkup: 10, fabMarkup: 5,
    materials: [
      {
        id: 101, parentMaterialId: null, sequence: 'A', description: 'Main Beam',
        category: 'Wide Flange', size: 'W 16 x 26', pieces: 1, quantity: 1,
        length: 57.17, weightPerFoot: 26, fabWeight: 1486,
        stockLength: 60, stocksRequired: 1, unitPrice: 0.62, totalCost: 921.32,
        priceBy: 'LB', isAutoGalv: false, isConnGalv: false,
        fabrication: [
          { id: 201, operation: 'Cut- Straight', qty: 2, unit: 'EA', rate: 15, totalCost: 30, isAutoGalv: false, isConnGalv: false },
          { id: 202, operation: 'Drill Holes', qty: 4, unit: 'EA', rate: 8, totalCost: 32, isAutoGalv: false, isConnGalv: false },
          { id: 203, operation: 'WF Connx', qty: 2, unit: 'EA', rate: 145, totalCost: 290, isAutoGalv: false, isConnGalv: false },
        ],
      },
      {
        id: 102, parentMaterialId: 101, sequence: 'A.1', description: 'Clip Angle',
        category: 'Angle', size: 'L 3 x 3 x 1/4', pieces: 2, quantity: 2,
        length: 0.75, weightPerFoot: 4.1, fabWeight: 6.15,
        stockLength: 20, stocksRequired: 1, unitPrice: 0.65, totalCost: 4.00,
        priceBy: 'LB', isAutoGalv: false, isConnGalv: false,
        fabrication: [
          { id: 211, operation: 'Cut- Straight', qty: 2, unit: 'EA', rate: 15, totalCost: 30, isAutoGalv: false, isConnGalv: false },
          { id: 212, operation: 'Drill Holes', qty: 3, unit: 'EA', rate: 8, totalCost: 24, isAutoGalv: false, isConnGalv: false },
          { id: 213, operation: 'Welding- Fillet', qty: 1, unit: 'EA', rate: 35, totalCost: 35, isAutoGalv: false, isConnGalv: false },
        ],
      },
      {
        id: 103, parentMaterialId: 101, sequence: 'A.2', description: 'End Plate',
        category: 'Plate', size: 'PL 3/8 x 6', pieces: 1, quantity: 1,
        length: 0.83, weightPerFoot: 7.65, fabWeight: 6.35,
        stockLength: 10, stocksRequired: 1, unitPrice: 0.68, totalCost: 4.32,
        priceBy: 'LB', isAutoGalv: false, isConnGalv: false,
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
    snapshots: [
      { id: 9001, imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAKAAoDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAIBgUH/8QAIhAAAgIBBAMBAAAAAAAAAAAAAQIDBAURBhIhMVH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Az7TdMu9UuhBZQNK+N2B4Cj1JPgCsLXtH1Lp5P7HZPsLNMEVpIHCqSPRGCCCO4IP5FfGF1brqVjcWtwgeCeNopFPRlYYI/kUUB//2Q==', caption: 'Detail A — connection at column base', sortOrder: 0 },
      { id: 9002, imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAKAAoDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAIBgUH/8QAIhAAAgIBBAMBAAAAAAAAAAAAAQIDBAURBhIhMVH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Az7TdMu9UuhBZQNK+N2B4Cj1JPgCsLXtH1Lp5P7HZPsLNMEVpIHCqSPRGCCCO4IP5FfGF1brqVjcWtwgeCeNopFPRlYYI/kUUB//2Q==', caption: 'Detail B — cope end profile', sortOrder: 1 },
    ],
  },
  {
    id: 2, itemNumber: '002', itemName: 'CANOPY SUPPORT FRAMING', drawingRef: 'S-100',
    breakoutGroupId: null, materialMarkup: 10, fabMarkup: 5,
    materials: [
      {
        id: 111, parentMaterialId: null, sequence: 'A', description: 'Column',
        category: 'Wide Flange', size: 'W 8 x 21', pieces: 1, quantity: 1,
        length: 24.75, weightPerFoot: 21, fabWeight: 519.75,
        stockLength: 30, stocksRequired: 1, unitPrice: 0.62, totalCost: 322.25,
        priceBy: 'LB', isAutoGalv: false, isConnGalv: false,
        fabrication: [
          { id: 231, operation: 'Cut- Straight', qty: 1, unit: 'EA', rate: 15, totalCost: 15, isAutoGalv: false, isConnGalv: false },
          { id: 232, operation: 'Cut- Single Cope End', qty: 1, unit: 'EA', rate: 28, totalCost: 28, isAutoGalv: false, isConnGalv: false },
          { id: 233, operation: 'Custom', customOperation: 'Kicker Brace Prep', qty: 1, unit: 'EA', rate: 45, totalCost: 45, isAutoGalv: false, isConnGalv: false },
        ],
      },
      {
        id: 112, parentMaterialId: null, sequence: 'B', description: 'Horizontal Tube',
        category: 'HSS', size: 'HSS 4 x 4 x 1/4', pieces: 2, quantity: 2,
        length: 3.58, weightPerFoot: 12.21, fabWeight: 87.4,
        stockLength: 20, stocksRequired: 1, unitPrice: 0.75, totalCost: 65.55,
        priceBy: 'LB', isAutoGalv: false, isConnGalv: false,
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
    snapshots: [],
  },
];

function calcBaseBid(items) {
  return items.reduce((s, item) => {
    const mat = item.materials.reduce((ms, m) => ms + (m.totalCost || 0), 0);
    const fab = item.materials.reduce((ms, m) => ms + (m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0), 0)
              + item.fabrication.reduce((fs, f) => fs + (f.totalCost || 0), 0);
    const recap = Object.values(item.recapCosts).reduce((rs, c) => rs + (c.total || 0), 0);
    return s + mat * (1 + (item.materialMarkup || 0) / 100) + fab * (1 + (item.fabMarkup || 0) / 100) + recap;
  }, 0);
}

const PROPS = {
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
  items: SAMPLE_ITEMS,
  breakoutTotals: { baseBid: calcBaseBid(SAMPLE_ITEMS), deducts: [], adds: [] },
  selectedExclusions: ['Bond/Tax', 'Engineering/Shop Drawings', 'Inspections/Permits of any kind'],
  customExclusions: [],
  selectedQualifications: ['Proposal valid for 30 days', 'Steel pricing subject to mill confirmation'],
  customQualifications: [],
  customRecapColumns: [],
  totals: {
    totalMaterialCost: 1317.44, totalFabricationCost: 790,
    totalMaterialMarkup: 131.74, totalFabMarkup: 39.5,
    totalMarkup: 171.24, totalRecapCosts: 5110,
    totalTax: 0, totalAdjustments: 0,
    subtotal: 7388.68, grandTotal: 7388.68,
    totalFabWeight: 2115.7, totalStockWeight: 0, totalConnectionWeight: 0,
  },
};

export default function TestPdfPage() {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);

  const addResult = (msg) => setResults(prev => [...prev, msg]);

  const runTest = async (type) => {
    setRunning(true);
    const start = Date.now();
    addResult(`[${type}] Starting…`);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const React = (await import('react')).default;

      let doc;
      if (type === 'JobFolder') {
        const { JobFolderPdf } = await import('../../components/pdf/JobFolderPdf');
        doc = React.createElement(JobFolderPdf, PROPS);
      } else {
        const { ErectorScopePdf } = await import('../../components/pdf/ErectorScopePdf');
        doc = React.createElement(ErectorScopePdf, PROPS);
      }

      const blob = await pdf(doc).toBlob();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const sizeKB = (blob.size / 1024).toFixed(1);

      // Verify it's a real PDF
      const header = await blob.slice(0, 5).text();
      const isPdf = header.startsWith('%PDF');

      addResult(`[${type}] ✓ ${sizeKB} KB in ${elapsed}s — PDF header: "${header}" — valid: ${isPdf}`);

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `TEST_${type}_${new Date().toISOString().slice(0,10)}.pdf`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      addResult(`[${type}] ✗ FAILED: ${e.message}`);
      console.error(e);
    }
    setRunning(false);
  };

  const runBoth = async () => {
    setResults([]);
    await runTest('ErectorScope');
    await runTest('JobFolder');
    setResults(prev => [...prev, '--- All tests complete ---']);
  };

  return (
    <div style={{ fontFamily: 'monospace', padding: 32, maxWidth: 800 }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>PDF Export Test Page</h1>
      <p style={{ marginBottom: 16, color: '#555', fontSize: 13 }}>
        Tests the exact same dynamic import path used by the Export button in SteelEstimator.
        Sample data: 2 items (4 materials total, parent/child structure, custom op, fab ops, recap costs).
      </p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => { setResults([]); runTest('ErectorScope'); }}
          disabled={running}
          style={{ padding: '8px 16px', background: '#1E40AF', color: 'white', border: 'none', borderRadius: 4, cursor: running ? 'not-allowed' : 'pointer' }}
        >
          Test Erector Scope
        </button>
        <button
          onClick={() => { setResults([]); runTest('JobFolder'); }}
          disabled={running}
          style={{ padding: '8px 16px', background: '#166534', color: 'white', border: 'none', borderRadius: 4, cursor: running ? 'not-allowed' : 'pointer' }}
        >
          Test Job Folder
        </button>
        <button
          onClick={runBoth}
          disabled={running}
          style={{ padding: '8px 16px', background: '#374151', color: 'white', border: 'none', borderRadius: 4, cursor: running ? 'not-allowed' : 'pointer' }}
        >
          Test Both
        </button>
      </div>

      <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 4, padding: 16, minHeight: 80 }}>
        {results.length === 0 && !running && <span style={{ color: '#9CA3AF' }}>Click a button to run the test.</span>}
        {running && <span style={{ color: '#F59E0B' }}>Running…</span>}
        {results.map((r, i) => (
          <div key={i} style={{ marginBottom: 4, color: r.includes('✓') ? '#166534' : r.includes('✗') ? '#991B1B' : '#374151' }}>
            {r}
          </div>
        ))}
      </div>

      <p style={{ marginTop: 16, fontSize: 11, color: '#9CA3AF' }}>
        /test-pdf — dev only, not linked from the main app
      </p>
    </div>
  );
}
