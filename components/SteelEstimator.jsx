import React, { useState, useRef, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { getFabPricingForSize, getCustomOps } from '../lib/fab-pricing';
import { apiFetch, ApiError, SessionExpiredError } from '../lib/api-client';
import { Plus, Trash2, Download, Save, ChevronDown, ChevronRight, X, Upload, AlertCircle, Check, Copy, FileText, ArrowLeft, Calculator, GripVertical } from 'lucide-react';
import CustomerSearchInput from './CustomerSearchInput';

// Company Logo (Base64 encoded)
import COMPANY_LOGO from '../lib/logo.js';
import { DEFAULT_PRICING_RATES } from '../lib/estimating/rates';
import { steelDatabase, categories } from '../lib/estimating/aisc-shapes';
import {
  OP_PRICING_FIELD, OP_WEIGHT_FIELD, OP_DEFAULT_UNIT,
  fabricationOperations, allFabOperations, CONNECTION_WEIGHT_OPS,
  wfConnectionWeights, cConnectionWeights, getConnectionWeight,
} from '../lib/estimating/fab-operations';
import { plateThicknesses, calcPlateWeightPerFoot } from '../lib/estimating/plates';
import { getStockLengthsForCategory } from '../lib/estimating/stock-lengths';
import { roundCustom, fmtWt, fmtPrice, fmtRate, fmtQuotePrice } from '../lib/estimating/format';
import { normalizeShapeSize, translateSizeToAISC } from '../lib/estimating/sizes';
import { calculateOptimalStock } from '../lib/estimating/stock-optimization';
import {
  isNestableMaterial, nestCutsFFD, MAX_NEST_PIECES, computeProjectNest, compressGroupSticks,
} from '../lib/estimating/nesting';
import { toAlphaSeq, toChildAlphaSuffix, parseAlphaSeq, parseChildAlphaSuffix } from '../lib/estimating/sequence';
import { MATERIAL_SORT_PRESETS } from '../lib/estimating/sorting';
import { calculateMaterial as engineCalculateMaterial } from '../lib/estimating/material-calc';
import { parseRevuCSV, aggregateImportData } from '../lib/estimating/import-revu';
import { parseVendorPricingCsv, vendorPricingFor, matchVendorPricing } from '../lib/estimating/import-rfq';
import { computeFabLineTotal, pooledLineCost, stockRowEstCost, roundLengthToInch } from '../lib/estimating/fab-costs';
import {
  calculateItemTax as engineCalculateItemTax,
  itemTaxBreakdown as engineItemTaxBreakdown,
  getItemTotal,
  calculateBreakoutTotals as engineBreakoutTotals,
  projectTotals,
} from '../lib/estimating/totals';

// ── Session-expiry stash ──────────────────────────────────────────────────────
// When a save fails because the session died, the full save payload is kept in
// localStorage so the work survives a re-login or even a closed tab. The stash
// is only cleared by a successful save or an explicit decline on restore.
const stashKey = (projectId) => `steel-estimator:stash:${projectId}`;

function writeStash(projectId, payload) {
  try {
    localStorage.setItem(
      stashKey(projectId),
      JSON.stringify({ savedAt: new Date().toISOString(), payload })
    );
  } catch (e) {
    // Quota exceeded on a huge estimate — the dirty flag still protects the work.
    console.warn('Could not stash unsaved changes locally:', e);
  }
}

function readStash(projectId) {
  try {
    const raw = localStorage.getItem(stashKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearStash(projectId) {
  try { localStorage.removeItem(stashKey(projectId)); } catch {}
}



// Standard exclusions
const standardExclusions = [
  'Bond/Tax',
  'Weekend, Night, Overtime Work',
  'Engineering/Shop Drawings',
  'Demolition/Shoring',
  'Finish Paint',
  'Inspections/Permits of any kind',
  'Removal and/or Replacement of fireproofing',
  'Signage of any kind',
  'MEP work of any kind',
  'Grout or Concrete Work',
  'Protection of existing finishes',
  'X-Ray or Scanning of any kind',
  'Drug testing/Badging/Background Checks',
  'Crane/Equipment rental',
  'Hoisting by others',
  'Access/Scaffolding by others'
];

// Standard qualifications
const standardQualifications = [
  'Proposal valid for 30 days',
  'Steel pricing subject to mill confirmation',
  'Based on drawings provided, changes may result in additional costs',
  'Standard lead time applies',
  'Access to work area during normal business hours',
  'Clear and level staging area required',
  'Single mobilization included',
  'Payment terms: Net 30'
];

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600',
  IN_REVIEW: 'bg-amber-100 text-amber-700 border-amber-300',
  PUBLISHED: 'bg-green-100 text-green-700 border-green-300',
  REOPENED: 'bg-purple-100 text-purple-700 border-purple-300',
};
const STATUS_LABELS = { DRAFT: 'Draft', IN_REVIEW: 'In Review', PUBLISHED: 'Published', REOPENED: 'Reopened' };

const SteelEstimator = ({ projectId, userRole, userName }) => {
  const [activeTab, setActiveTab] = useState('project');
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [currentProjectId, setCurrentProjectId] = useState(projectId || null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [projectStatus, setProjectStatus] = useState('DRAFT');
  const [statusChanging, setStatusChanging] = useState(false);
  const [stockListSort, setStockListSort] = useState({ field: 'size', dir: 'asc' });
  const [stockListFilter, setStockListFilter] = useState('');
  const [showCutDetail, setShowCutDetail] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [customLenInputs, setCustomLenInputs] = useState({});
  
  // Project Info
  const [projectName, setProjectName] = useState('');
  const [projectAddress, setProjectAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [billingAddress, setBillingAddress] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [estimateDate, setEstimateDate] = useState(new Date().toISOString().split('T')[0]);
  const [bidTime, setBidTime] = useState('');
  const [estimatedBy, setEstimatedBy] = useState('');
  const [drawingDate, setDrawingDate] = useState('');
  const [drawingRevision, setDrawingRevision] = useState('');
  const [architect, setArchitect] = useState('');

  // Dashboard fields
  const [estimatorId, setEstimatorId] = useState(null);
  const [dashboardStatus, setDashboardStatus] = useState('');
  const [newOrCo, setNewOrCo] = useState('');
  const [notes, setNotes] = useState('');
  const [usersList, setUsersList] = useState([]);

  // Project Types
  const [projectTypes, setProjectTypes] = useState({
    structural: false,
    miscellaneous: false,
    ornamental: false
  });
  
  const toggleProjectType = (type) => {
    setProjectTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };
  
  // Delivery Options
  const [deliveryOptions, setDeliveryOptions] = useState({
    installed: false,
    fobJobsite: false,
    willCall: false
  });
  
  const toggleDeliveryOption = (option) => {
    setDeliveryOptions({ installed: false, fobJobsite: false, willCall: false, [option]: true });
    setSelectedCustomDelivery(null);
  };
  
  // Tax Category
  const TAX_RATE = DEFAULT_PRICING_RATES.taxRate;
  const [taxCategory, setTaxCategory] = useState(null);

  // Cross-item stock nesting (persisted per project)
  const [nestingEnabled, setNestingEnabled] = useState(false);
  const [nestKerfIn, setNestKerfIn] = useState(0.25);   // saw kerf per cut, inches
  const [nestEndCropIn, setNestEndCropIn] = useState(0); // end crop per stick, inches

  // Supplier stock-length availability, per size (persisted per project).
  // Map: size string → { lengths: [purchasable lengths], caps: { len: maxSticks } }.
  // Legacy saves may hold a plain array (lengths only). Absent size = category
  // standards, unlimited supply. Lets the estimator drop lengths the supplier
  // can't ship, add custom / mill-order lengths, and cap stick counts.
  const [stockLengthOverrides, setStockLengthOverrides] = useState({});

  const normalizeLengthOverride = (o) => {
    if (Array.isArray(o)) return { lengths: o, caps: {} };
    if (o && typeof o === 'object') {
      return {
        lengths: Array.isArray(o.lengths) ? o.lengths : [],
        caps: (o.caps && typeof o.caps === 'object') ? o.caps : {},
      };
    }
    return null;
  };

  const availableLengthsFor = (category, size) => {
    const o = size ? normalizeLengthOverride(stockLengthOverrides[size]) : null;
    if (o && o.lengths.length > 0) return [...o.lengths].sort((a, b) => a - b);
    return getStockLengthsForCategory(category);
  };

  // Max sticks the supplier can supply, per length (absent = unlimited)
  const lengthCapsFor = (category, size) => {
    const o = size ? normalizeLengthOverride(stockLengthOverrides[size]) : null;
    return o ? o.caps : {};
  };

  const isDefaultOverride = (category, lengths, caps) => {
    const defaults = getStockLengthsForCategory(category);
    return Object.keys(caps).length === 0 &&
      lengths.length === defaults.length &&
      defaults.every(d => lengths.includes(d));
  };

  const updateSizeOverride = (category, size, mutate) => {
    setStockLengthOverrides(prev => {
      const defaults = getStockLengthsForCategory(category);
      const cur = normalizeLengthOverride(prev[size]) || { lengths: [], caps: {} };
      const lengths = cur.lengths.length > 0 ? [...cur.lengths] : [...defaults];
      const caps = { ...cur.caps };
      const next = mutate({ lengths, caps });
      if (!next) return prev;
      const { [size]: _removed, ...rest } = prev;
      return isDefaultOverride(category, next.lengths, next.caps)
        ? rest
        : { ...rest, [size]: next };
    });
  };

  const toggleSizeLength = (category, size, len) => {
    updateSizeOverride(category, size, ({ lengths, caps }) => {
      let next = lengths.includes(len)
        ? lengths.filter(l => l !== len)
        : [...lengths, len].sort((a, b) => a - b);
      if (next.length === 0) next = [len]; // never leave a size unbuyable
      if (!next.includes(len)) delete caps[len]; // removed length drops its cap
      return { lengths: next, caps };
    });
  };

  const addCustomSizeLength = (category, size, len) => {
    const n = parseFloat(len);
    if (!n || n <= 0) return;
    updateSizeOverride(category, size, ({ lengths, caps }) => {
      if (lengths.includes(n)) return null;
      return { lengths: [...lengths, n].sort((a, b) => a - b), caps };
    });
  };

  const setSizeLengthCap = (category, size, len, raw) => {
    const n = parseInt(raw);
    updateSizeOverride(category, size, ({ lengths, caps }) => {
      if (n > 0) caps[len] = n; else delete caps[len];
      return { lengths, caps };
    });
  };

  const resetSizeLengths = (size) => {
    setStockLengthOverrides(prev => {
      const { [size]: _removed, ...rest } = prev;
      return rest;
    });
  };
  
  const taxCategoryDescriptions = {
    newConstruction: {
      label: 'New Construction',
      description: 'Separated contract — tax applies to materials only. Fabrication labor and installation labor are not taxable.',
      color: 'blue'
    },
    resale: {
      label: 'Resale',
      description: 'Buyer provides resale certificate — no tax collected. Tax responsibility transfers to the purchaser.',
      color: 'green'
    },
    fob: {
      label: 'F.O.B.',
      description: 'Sale of fabricated tangible personal property — tax applies to materials and fabrication. Customer takes title at shop.',
      color: 'amber'
    },
    noTax: {
      label: 'No Tax',
      description: 'Government, exempt organizations, or other tax-exempt entities — no tax on any cost component.',
      color: 'gray'
    }
  };

  // Calculate tax for a single item based on taxCategory
  const calculateItemTax = (item) => engineCalculateItemTax(item, taxCategory, DEFAULT_PRICING_RATES);

  const getItemTaxBreakdown = (item) => engineItemTaxBreakdown(item, taxCategory, DEFAULT_PRICING_RATES);
  
  // Vendor RFQ
  const [showRfqModal, setShowRfqModal] = useState(false);
  const [rfqVendors, setRfqVendors] = useState([
    { id: 1, name: '', email: '', phone: '' }
  ]);
  const [rfqNotes, setRfqNotes] = useState('');
  const [rfqDeliveryDate, setRfqDeliveryDate] = useState('');
  const [rfqResponseDate, setRfqResponseDate] = useState('');
  const [rfqUploadResult, setRfqUploadResult] = useState(null);
  
  const addRfqVendor = () => {
    setRfqVendors([...rfqVendors, { id: Date.now(), name: '', email: '', phone: '' }]);
  };
  
  const updateRfqVendor = (id, field, value) => {
    setRfqVendors(rfqVendors.map(v => v.id === id ? { ...v, [field]: value } : v));
  };
  
  const removeRfqVendor = (id) => {
    if (rfqVendors.length > 1) {
      setRfqVendors(rfqVendors.filter(v => v.id !== id));
    }
  };
  
  // Generate RFQ text for email/clipboard
  const generateRfqText = () => {
    let text = `REQUEST FOR QUOTATION\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Project: ${projectName || 'TBD'}\n`;
    text += `Location: ${projectAddress || 'TBD'}\n`;
    text += `Date: ${new Date().toLocaleDateString()}\n`;
    if (rfqResponseDate) text += `Quote Needed By: ${new Date(rfqResponseDate).toLocaleDateString()}\n`;
    if (rfqDeliveryDate) text += `Delivery Required: ${new Date(rfqDeliveryDate).toLocaleDateString()}\n`;
    text += `\n${'='.repeat(50)}\n`;
    text += `MATERIAL LIST\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `${'Size'.padEnd(20)}${'Length'.padEnd(10)}${'Qty'.padEnd(8)}${'Wt/ft'.padEnd(10)}${'Est. Wt'.padEnd(12)}${'Your Price'.padEnd(12)}\n`;
    text += `${'-'.repeat(72)}\n`;
    
    let totalWeight = 0;
    stockList.forEach(stock => {
      totalWeight += stock.totalWeight;
      text += `${stock.size.padEnd(20)}${(stock.stockLength + "'").padEnd(10)}${String(stock.totalStocks).padEnd(8)}${(stock.weightPerFoot || 0).toFixed(1).padEnd(10)}${String(roundCustom(stock.totalWeight)).padEnd(12)}${'$_______'}\n`;
    });
    
    text += `${'-'.repeat(72)}\n`;
    text += `${'TOTAL ESTIMATED WEIGHT:'.padEnd(48)}${roundCustom(totalWeight)} lbs\n\n`;
    text += `${'='.repeat(50)}\n`;
    text += `QUOTE SUMMARY\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Total Material Price: $______________\n`;
    text += `Delivery Charge: $______________\n`;
    text += `Total Quote: $______________\n`;
    text += `Lead Time: ______________ days\n\n`;
    
    if (rfqNotes) {
      text += `NOTES:\n${rfqNotes}\n\n`;
    }
    
    text += `Please return quote to:\n`;
    text += `${estimatedBy || '[Your Name]'}\n`;
    text += `${customerEmail || '[Your Email]'}\n`;
    
    return text;
  };
  // Click-outside handler for export dropdown
  useEffect(() => {
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target))
        setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // PDF Export handlers
  const handleExportErectorScope = async () => {
    setShowExportMenu(false); setPdfExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { ErectorScopePdf } = await import('./pdf/ErectorScopePdf');
      const blob = await pdf(<ErectorScopePdf logo={COMPANY_LOGO} projectName={projectName}
        projectAddress={projectAddress} drawingRevision={drawingRevision}
        drawingDate={drawingDate} estimateDate={estimateDate} estimatedBy={estimatedBy}
        architect={architect} projectTypes={projectTypes} deliveryOptions={deliveryOptions}
        customProjectTypes={customProjectTypes} selectedCustomDelivery={selectedCustomDelivery}
        selectedExclusions={selectedExclusions} customExclusions={customExclusions}
        selectedQualifications={selectedQualifications} customQualifications={customQualifications}
        items={items} />).toBlob();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `${projectName || 'ErectorScope'}_${new Date().toISOString().slice(0,10)}.pdf`
      });
      a.click(); URL.revokeObjectURL(a.href);
    } catch(e) { alert('PDF export failed: ' + e.message); }
    finally { setPdfExporting(false); }
  };

  const handleExportJobFolder = async () => {
    setShowExportMenu(false); setPdfExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { JobFolderPdf } = await import('./pdf/JobFolderPdf');
      const blob = await pdf(<JobFolderPdf logo={COMPANY_LOGO} projectName={projectName}
        projectAddress={projectAddress} customerName={customerName}
        billingAddress={billingAddress} customerContact={customerContact}
        customerPhone={customerPhone} customerEmail={customerEmail}
        estimateDate={estimateDate} estimatedBy={estimatedBy}
        drawingDate={drawingDate} drawingRevision={drawingRevision} architect={architect}
        projectTypes={projectTypes} deliveryOptions={deliveryOptions} taxCategory={taxCategory}
        customProjectTypes={customProjectTypes} selectedCustomDelivery={selectedCustomDelivery}
        items={items} breakoutTotals={breakoutTotals}
        selectedExclusions={selectedExclusions} customExclusions={customExclusions}
        selectedQualifications={selectedQualifications} customQualifications={customQualifications}
        customRecapColumns={customRecapColumns} totals={totals} />).toBlob();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `${projectName || 'JobFolder'}_${new Date().toISOString().slice(0,10)}.pdf`
      });
      a.click(); URL.revokeObjectURL(a.href);
    } catch(e) { alert('PDF export failed: ' + e.message); }
    finally { setPdfExporting(false); }
  };

  // Build priced rows for the Stock List exports (respects the on-screen
  // filter and sort so what you print is what you see)
  const buildStockListExport = () => {
    const rows = displayedStockList.map(r => {
      const sp = sizePricing.get(r.size);
      const hasRate = !!sp && !sp.mixed && (sp.unitPrice || 0) > 0;
      const estCost = stockRowEstCost(r, sp);
      return {
        itemNumber: r.pooled ? 'Pooled' : r.itemNumber,
        size: r.size,
        stockLength: r.stockLength,
        totalStocks: r.totalStocks,
        weightPerFoot: r.weightPerFoot || 0,
        totalWeight: r.totalWeight,
        priceBy: hasRate ? sp.priceBy : (sp?.mixed ? 'mixed' : ''),
        rate: hasRate ? sp.unitPrice : null,
        estCost,
      };
    });
    const totalWeight = rows.reduce((s, r) => s + r.totalWeight, 0);
    const totalCost = rows.reduce((s, r) => s + (r.estCost || 0), 0);
    const shortfalls = (projectNest?.groups || [])
      .filter(g => g.shortfallCuts.length > 0)
      .map(g => {
        const ft = g.shortfallCuts.reduce((s, c) => s + c.length, 0);
        return {
          size: g.size,
          cuts: g.shortfallCuts.length,
          totalFt: +ft.toFixed(2),
          lbs: ft * (g.weightPerFoot || 0),
          detail: g.shortfallCuts.map(c => `${+c.length.toFixed(2)}' (Item ${c.itemNumber})`).join(', '),
        };
      });
    return {
      rows,
      totalWeight,
      totalCost,
      shortfalls,
      filterNote: stockListFilter ? ` (filtered: "${stockListFilter}")` : '',
    };
  };

  const handleExportStockListPdf = async () => {
    setShowExportMenu(false); setPdfExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { StockListPdf } = await import('./pdf/StockListPdf');
      const data = buildStockListExport();
      const blob = await pdf(<StockListPdf logo={COMPANY_LOGO} projectName={projectName}
        projectAddress={projectAddress} estimatedBy={estimatedBy}
        generatedDate={new Date().toLocaleDateString()} {...data} />).toBlob();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `${projectName || 'Project'}_StockBuyList_${new Date().toISOString().slice(0,10)}.pdf`
      });
      a.click(); URL.revokeObjectURL(a.href);
    } catch(e) { alert('PDF export failed: ' + e.message); }
    finally { setPdfExporting(false); }
  };

  const handleExportCutDetailPdf = async () => {
    setShowExportMenu(false);
    if (!projectNest || projectNest.groups.length === 0) {
      alert('Cut detail requires cross-item nesting — enable "Nest stock across items" on the Project Info tab.');
      return;
    }
    setPdfExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { CutDetailPdf } = await import('./pdf/CutDetailPdf');
      const groups = projectNest.groups.map(g => ({
        size: g.size,
        stickCount: g.sticks.length,
        yieldPct: (100 / g.yield).toFixed(1),
        buyLengthFt: +g.buyLengthFt.toFixed(2),
        netLengthFt: +g.netLengthFt.toFixed(2),
        weightPerFoot: g.weightPerFoot || 0,
        rows: compressGroupSticks(g).map(r => ({
          count: r.count,
          stockLength: r.stockLength,
          partsText: r.parts.map(p => `${p.n} × ${+p.len.toFixed(2)}'  [Item ${p.itemNo}]`).join('   +   '),
          dropFt: (r.stockLength - r.usedFt).toFixed(2),
        })),
        overLengthText: g.overLengthCuts.length > 0
          ? g.overLengthCuts.map(c => `${+c.length.toFixed(2)}' (Item ${c.itemNumber})`).join(', ')
          : null,
        shortfallText: g.shortfallCuts.length > 0
          ? g.shortfallCuts.map(c => `${+c.length.toFixed(2)}' (Item ${c.itemNumber})`).join(', ')
          : null,
      }));
      const blob = await pdf(<CutDetailPdf logo={COMPANY_LOGO} projectName={projectName}
        projectAddress={projectAddress} estimatedBy={estimatedBy}
        generatedDate={new Date().toLocaleDateString()}
        kerfIn={parseFloat(nestKerfIn) || 0} endCropIn={parseFloat(nestEndCropIn) || 0}
        groups={groups} />).toBlob();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `${projectName || 'Project'}_CutDetail_${new Date().toISOString().slice(0,10)}.pdf`
      });
      a.click(); URL.revokeObjectURL(a.href);
    } catch(e) { alert('PDF export failed: ' + e.message); }
    finally { setPdfExporting(false); }
  };

  const handleExportStockListCsv = () => {
    const { rows, totalWeight, totalCost, shortfalls, filterNote } = buildStockListExport();
    let csv = `Stock Material Buy List - ${projectName || 'Project'}${filterNote}\n`;
    csv += `Generated ${new Date().toLocaleDateString()}\n\n`;
    csv += 'Item #,Size,Stock Length (ft),Qty Sticks,Wt/Ft,Total Weight (lbs),Units,Rate,Est Cost\n';
    rows.forEach(r => {
      csv += `${r.itemNumber},${normalizeShapeSize(r.size)},${r.stockLength},${r.totalStocks},${r.weightPerFoot.toFixed(2)},${roundCustom(r.totalWeight)},${r.rate != null ? r.priceBy : ''},${r.rate != null ? r.rate : ''},${r.estCost != null ? roundCustom(r.estCost) : ''}\n`;
    });
    csv += `TOTAL,,,,,${roundCustom(totalWeight)},,,${roundCustom(totalCost)}\n`;
    if (shortfalls.length > 0) {
      csv += '\nSUPPLIER SHORTFALL (not included in buy list above)\n';
      csv += 'Size,Cuts,Total Ft,Est Lbs,Detail\n';
      shortfalls.forEach(s => {
        csv += `${normalizeShapeSize(s.size)},${s.cuts},${s.totalFt},${roundCustom(s.lbs)},"${s.detail}"\n`;
      });
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `${projectName || 'Project'}_StockBuyList_${new Date().toISOString().slice(0,10)}.csv`
    });
    a.click(); URL.revokeObjectURL(a.href);
  };

  // Copy RFQ to clipboard
  const copyRfqToClipboard = () => {
    const text = generateRfqText();
    navigator.clipboard.writeText(text).then(() => {
      alert('RFQ copied to clipboard! Paste into email to send to vendors.');
    });
  };
  
  // Generate CSV for Excel
  const downloadRfqCsv = () => {
    let csv = 'REQUEST FOR QUOTATION\n';
    csv += `Project,${projectName || ''}\n`;
    csv += `Location,${projectAddress || ''}\n`;
    csv += `Date,${new Date().toLocaleDateString()}\n`;
    if (rfqResponseDate) csv += `Quote Needed By,${new Date(rfqResponseDate).toLocaleDateString()}\n`;
    if (rfqDeliveryDate) csv += `Delivery Required,${new Date(rfqDeliveryDate).toLocaleDateString()}\n`;
    csv += '\n';
    csv += 'Size,Stock Length,Quantity,Weight/Ft,Est Total Weight,Your $/CWT,Your $/LB,Your $/LF,Your $/EA,Your Total,Lead Time,Notes\n';

    stockList.forEach(stock => {
      csv += `${normalizeShapeSize(stock.size)},${stock.stockLength},${stock.totalStocks},${(stock.weightPerFoot || 0).toFixed(2)},${roundCustom(stock.totalWeight)},,,,,,\n`;
    });
    
    csv += '\n';
    csv += 'TOTALS,,,,' + roundCustom(stockList.reduce((sum, s) => sum + s.totalWeight, 0)) + '\n';
    csv += '\n';
    csv += 'Total Material Price,\n';
    csv += 'Delivery Charge,\n';
    csv += 'Total Quote,\n';
    
    if (rfqNotes) {
      csv += '\nNotes,' + rfqNotes.replace(/,/g, ';') + '\n';
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RFQ_${projectName || 'Steel'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Upload vendor-returned RFQ CSV and apply pricing to matching materials
  const handleRfqPricingUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // allow re-upload of same file

    const reader = new FileReader();
    reader.onload = (evt) => {
      // Parse + match via the estimating engine (lib/estimating/import-rfq.js)
      const parsed = parseVendorPricingCsv(evt.target.result);
      if (parsed.error) {
        setRfqUploadResult({ error: parsed.error });
        return;
      }
      const { pricingMap, bySize } = parsed;
      const { matchedKeys, unmatchedSizes } = matchVendorPricing(items, pricingMap, bySize);

      // Apply pricing to all matching materials
      setItems(prevItems => prevItems.map(item => ({
        ...item,
        materials: item.materials.map(mat => {
          const pricing = vendorPricingFor(mat, pricingMap, bySize);
          if (!pricing) return mat;
          return calculateMaterial({ ...mat, priceBy: pricing.priceBy, unitPrice: pricing.unitPrice });
        }),
      })));

      setRfqUploadResult({ matched: matchedKeys.size, total: pricingMap.size, unmatched: unmatchedSizes });
    };

    reader.readAsText(file);
  };


  // Exclusions & Qualifications
  const [selectedExclusions, setSelectedExclusions] = useState([
    'Bond/Tax', 'Engineering/Shop Drawings', 'Inspections/Permits of any kind'
  ]);
  const [customExclusions, setCustomExclusions] = useState([]);
  const [newCustomExclusion, setNewCustomExclusion] = useState('');
  const [selectedQualifications, setSelectedQualifications] = useState([
    'Proposal valid for 30 days', 'Steel pricing subject to mill confirmation'
  ]);
  const [customQualifications, setCustomQualifications] = useState([]);
  const [newCustomQualification, setNewCustomQualification] = useState('');

  const [customProjectTypes, setCustomProjectTypes] = useState([]);
  const [newCustomProjectType, setNewCustomProjectType] = useState('');
  const [customDeliveryOptions, setCustomDeliveryOptions] = useState([]);
  const [selectedCustomDelivery, setSelectedCustomDelivery] = useState(null);
  const [newCustomDeliveryOption, setNewCustomDeliveryOption] = useState('');

  // Breakout Groups
  const [breakoutGroups, setBreakoutGroups] = useState([]);
  
  // General Adjustments (internal only - baked into total but not shown on quote)
  const [adjustments, setAdjustments] = useState([]);
  
  // Custom Recap Columns
  const [customRecapColumns, setCustomRecapColumns] = useState([]);
  
  // Markup
  // Markup is now per-item in recap costs
  
  // Items
  const [expandedItems, setExpandedItems] = useState({ 1: true });
  const [items, setItems] = useState([
    {
      id: 1,
      itemNumber: '001',
      itemName: 'New Item',
      drawingRef: '',
      breakoutGroupId: null,
      materials: [],
      fabrication: [],
      // Recap costs per item
      recapCosts: {
        installation: { cost: 0, markup: 0, total: 0 },
        drafting: { cost: 0, markup: 0, total: 0 },
        engineering: { cost: 0, markup: 0, total: 0 },
        projectManagement: { hours: 0, rate: 60, total: 0 },
        shipping: { cost: 0, markup: 0, total: 0 }
      }
    }
  ]);

  // CSV Import State (Revu)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);
  const pricingCacheRef = useRef(new Map()); // sizeKey → getFabPricingForSize result

  // PDF Export State
  const [pdfExporting, setPdfExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);

  // Custom fab operations from the admin-defined DB table
  const [customOps, setCustomOps] = useState([]);
  useEffect(() => { getCustomOps().then(setCustomOps).catch(() => {}); }, []);

  const customOpRateMap = useMemo(() => {
    const m = {};
    for (const op of customOps) m[op.name] = { rate: op.rate, unit: op.defaultUnit };
    return m;
  }, [customOps]);

  // Fetch pricing for a beam size, using an in-memory cache to avoid repeat server calls.
  const getPricingForSize = useCallback(async (rawSize) => {
    if (!rawSize) return null;
    const key = rawSize.replace(/\s+/g, '').replace(/x/g, 'X').toUpperCase();
    if (pricingCacheRef.current.has(key)) return pricingCacheRef.current.get(key);
    const pricing = await getFabPricingForSize(rawSize);
    pricingCacheRef.current.set(key, pricing); // cache null too (no entry in DB)
    return pricing;
  }, []);

  // Takeoff CSV Import State (Neilsoft 19-column)
  const [showTakeoffModal, setShowTakeoffModal] = useState(false);
  const [takeoffPreview, setTakeoffPreview] = useState(null);
  const [takeoffError, setTakeoffError] = useState(null);
  const [takeoffImporting, setTakeoffImporting] = useState(false);
  const takeoffFileInputRef = useRef(null);
  const isLoadedRef = useRef(false);      // blocks dirty tracking during initial load
  const autoSaveTimerRef = useRef(null);  // debounce timer handle
  const saveRef = useRef(null);           // always points to latest handleSave
  const [isDirty, setIsDirty] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const sessionExpiredRef = useRef(false); // read by autosave timers at fire time
  useEffect(() => { sessionExpiredRef.current = sessionExpired; }, [sessionExpired]);

  // Rehydrate all editable state from a stashed save payload. The payload is
  // client-shape data (exactly what handleSave sends), so no server-shape
  // mapping is needed — this runs on top of a normal load, overlaying the
  // stashed edits while server-owned fields (status, permissions) stay put.
  const applyStashPayload = useCallback((p) => {
    setProjectName(p.projectName || '');
    setProjectAddress(p.projectAddress || '');
    setCustomerName(p.customerName || '');
    setCustomerId(p.customerId || null);
    setBillingAddress(p.billingAddress || '');
    setCustomerContact(p.customerContact || '');
    setCustomerPhone(p.customerPhone || '');
    setCustomerEmail(p.customerEmail || '');
    setEstimateDate(p.estimateDate || '');
    setBidTime(p.bidTime || '');
    setEstimatedBy(p.estimatedBy || '');
    setDrawingDate(p.drawingDate || '');
    setDrawingRevision(p.drawingRevision || '');
    setArchitect(p.architect || '');
    setEstimatorId(p.estimatorId || null);
    setDashboardStatus(p.dashboardStatus || '');
    setNewOrCo(p.newOrCo || '');
    setNotes(p.notes || '');
    setProjectTypes({
      structural: p.typeStructural || false,
      miscellaneous: p.typeMiscellaneous || false,
      ornamental: p.typeOrnamental || false,
    });
    setDeliveryOptions({
      installed: p.deliveryInstalled || false,
      fobJobsite: p.deliveryFobJobsite || false,
      willCall: p.deliveryWillCall || false,
    });
    setTaxCategory(p.taxCategory || null);
    setNestingEnabled(p.nestingEnabled || false);
    setNestKerfIn(typeof p.nestKerfIn === 'number' ? p.nestKerfIn : 0.25);
    setNestEndCropIn(typeof p.nestEndCropIn === 'number' ? p.nestEndCropIn : 0);
    setStockLengthOverrides(p.stockLengthOverrides && typeof p.stockLengthOverrides === 'object' ? p.stockLengthOverrides : {});
    setBreakoutGroups(p.breakoutGroups || []);
    setAdjustments(p.adjustments || []);
    setSelectedExclusions(p.selectedExclusions || []);
    setCustomExclusions(p.customExclusions || []);
    setSelectedQualifications(p.selectedQualifications || []);
    setCustomQualifications(p.customQualifications || []);
    setCustomRecapColumns(p.customRecapColumns || []);
    setCustomProjectTypes(p.customProjectTypes || []);
    setCustomDeliveryOptions((p.customDeliveryOptions || []).map(o => o.text));
    setSelectedCustomDelivery((p.customDeliveryOptions || []).find(o => o.isSelected)?.text || null);
    if (p.items) {
      setItems(p.items);
      const expanded = {};
      p.items.forEach(item => { expanded[item.id] = true; });
      setExpandedItems(expanded);
    }
  }, []);

  // ── LOAD PROJECT FROM DATABASE ──────────────────────────────────────────────
  const handleLoad = useCallback(async (id) => {
    isLoadedRef.current = false;
    try {
      const data = await apiFetch(`/api/projects/${id}`);

      setProjectStatus(data.status || 'DRAFT');
      setProjectName(data.projectName || '');
      setProjectAddress(data.projectAddress || '');
      setCustomerName(data.customerName || '');
      setCustomerId(data.customerId || null);
      setBillingAddress(data.billingAddress || '');
      setCustomerContact(data.customerContact || '');
      setCustomerPhone(data.customerPhone || '');
      setCustomerEmail(data.customerEmail || '');
      setEstimateDate(data.bidDate ? new Date(data.bidDate).toISOString().split('T')[0] : (data.estimateDate || ''));
      setBidTime(data.bidTime || '');
      setEstimatedBy(data.estimatedBy || '');
      setDrawingDate(data.drawingDate || '');
      setDrawingRevision(data.drawingRevision || '');
      setArchitect(data.architect || '');
      setEstimatorId(data.estimatorId || null);
      setDashboardStatus(data.dashboardStatus || '');
      setNewOrCo(data.newOrCo || '');
      setNotes(data.notes || '');

      setProjectTypes({
        structural: data.typeStructural || false,
        miscellaneous: data.typeMiscellaneous || false,
        ornamental: data.typeOrnamental || false,
      });

      setDeliveryOptions({
        installed: data.deliveryInstalled || false,
        fobJobsite: data.deliveryFobJobsite || false,
        willCall: data.deliveryWillCall || false,
      });

      setTaxCategory(data.taxCategory || null);

      setNestingEnabled(data.nestingEnabled || false);
      setNestKerfIn(typeof data.nestKerfIn === 'number' ? data.nestKerfIn : 0.25);
      setNestEndCropIn(typeof data.nestEndCropIn === 'number' ? data.nestEndCropIn : 0);
      try {
        const parsed = JSON.parse(data.stockLengthOverrides || '{}');
        setStockLengthOverrides(parsed && typeof parsed === 'object' ? parsed : {});
      } catch { setStockLengthOverrides({}); }

      const stdExc = (data.exclusions || []).filter(e => !e.isCustom).map(e => e.text);
      const custExc = (data.exclusions || []).filter(e => e.isCustom).map(e => e.text);
      setSelectedExclusions(stdExc);
      setCustomExclusions(custExc);

      const stdQual = (data.qualifications || []).filter(q => !q.isCustom).map(q => q.text);
      const custQual = (data.qualifications || []).filter(q => q.isCustom).map(q => q.text);
      setSelectedQualifications(stdQual);
      setCustomQualifications(custQual);

      setCustomProjectTypes((data.customProjectTypes || []).map(t => t.text));

      const custDeliv = data.customDeliveryOptions || [];
      setCustomDeliveryOptions(custDeliv.map(o => o.text));
      setSelectedCustomDelivery(custDeliv.find(o => o.isSelected)?.text || null);

      setBreakoutGroups((data.breakoutGroups || []).map(g => ({ id: g.id, name: g.name, type: g.type })));
      setAdjustments((data.adjustments || []).map(a => ({ id: a.id, description: a.description, amount: a.amount })));
      setCustomRecapColumns((data.customRecapColumns || []).map(c => ({ key: c.key, name: c.name })));

      if (data.items && data.items.length > 0) {
        const loadedItems = data.items.map(item => {
          const recapObj = {};
          (item.recapCosts || []).forEach(rc => {
            recapObj[rc.costType] = {
              cost: rc.cost || 0,
              markup: rc.markup || 0,
              total: rc.total || 0,
              hours: rc.hours || 0,
              rate: rc.rate || 0,
            };
          });
          if (!recapObj.installation) recapObj.installation = { cost: 0, markup: 0, total: 0 };
          if (!recapObj.drafting) recapObj.drafting = { cost: 0, markup: 0, total: 0 };
          if (!recapObj.engineering) recapObj.engineering = { cost: 0, markup: 0, total: 0 };
          if (!recapObj.projectManagement) recapObj.projectManagement = { hours: 0, rate: 60, total: 0 };
          if (!recapObj.shipping) recapObj.shipping = { cost: 0, markup: 0, total: 0 };

          return {
            id: item.id,
            itemNumber: item.itemNumber || '001',
            itemName: item.itemName || 'New Item',
            drawingRef: item.drawingRef || '',
            materialMarkup: item.materialMarkup || 0,
            fabMarkup: item.fabMarkup || 0,
            priceStandalone: item.priceStandalone || false,
            breakoutGroupId: item.breakoutGroupId || null,
            recapCosts: recapObj,
            materials: (item.materials || []).map(mat => ({
              id: mat.id,
              category: mat.category || '',
              shape: mat.shape || '',
              size: mat.shape || '',
              description: mat.description || '',
              length: mat.length || 0,
              pieces: mat.pieces || 0,
              stockLength: mat.stockLength || 0,
              stocksRequired: mat.stocksRequired || 0,
              waste: mat.waste || 0,
              weightPerFoot: mat.weightPerFt || (mat.shape && steelDatabase[mat.shape]?.weight) || 0,
              fabWeight: mat.fabWeight || 0,
              stockWeight: mat.stockWeight || 0,
              priceBy: mat.priceBy || 'LB',
              unitPrice: mat.unitPrice || 0,
              pricePerFt: mat.pricePerFt || 0,
              pricePerLb: mat.pricePerLb || 0,
              totalCost: mat.totalCost || 0,
              galvanized: mat.galvanized || false,
              galvRate: mat.galvRate || 0,
              width: mat.width || null,
              thickness: mat.thickness || null,
              fabrication: (mat.fabrication || []).map(f => {
                const derivedRate = f.rate || (f.quantity > 0 && f.totalCost > 0 ? f.totalCost / f.quantity : 0);
                const isGalv = f.isGalvLine || false;
                return {
                  id: f.id,
                  operation: f.operation || '',
                  quantity: f.quantity || 0,
                  unit: f.unit || 'ea',
                  rate: derivedRate,
                  unitPrice: derivedRate,
                  totalCost: f.totalCost || 0,
                  connWeight: f.connWeight || 0,
                  isGalvLine: isGalv,
                  ...(isGalv ? {
                    isAutoGalv: true,
                    description: f.operation === 'Galvanizing' ? `Galv - ${mat.description || mat.shape}` : (f.operation || ''),
                    multiplyByPieces: false,
                  } : {}),
                };
              }),
              children: (mat.children || []).map(child => ({
                id: child.id,
                category: child.category || '',
                shape: child.shape || '',
                size: child.shape || '',
                description: child.description || '',
                length: child.length || 0,
                pieces: child.pieces || 0,
                stockLength: child.stockLength || 0,
                stocksRequired: child.stocksRequired || 0,
                waste: child.waste || 0,
                weightPerFoot: child.weightPerFt || (child.shape && steelDatabase[child.shape]?.weight) || 0,
                fabWeight: child.fabWeight || 0,
                stockWeight: child.stockWeight || 0,
                priceBy: child.priceBy || 'LB',
                unitPrice: child.unitPrice || 0,
                pricePerFt: child.pricePerFt || 0,
                pricePerLb: child.pricePerLb || 0,
                totalCost: child.totalCost || 0,
                galvanized: child.galvanized || false,
                galvRate: child.galvRate || 0,
                width: child.width || null,
                thickness: child.thickness || null,
                fabrication: (child.fabrication || []).map(f => {
                  const derivedRate = f.rate || (f.quantity > 0 && f.totalCost > 0 ? f.totalCost / f.quantity : 0);
                  const isGalv = f.isGalvLine || false;
                  return {
                    id: f.id,
                    operation: f.operation || '',
                    quantity: f.quantity || 0,
                    unit: f.unit || 'ea',
                    rate: derivedRate,
                    unitPrice: derivedRate,
                    totalCost: f.totalCost || 0,
                    connWeight: f.connWeight || 0,
                    isGalvLine: isGalv,
                    ...(isGalv ? {
                      isAutoGalv: true,
                      description: f.operation === 'Galvanizing' ? `Galv - ${child.description || child.shape}` : (f.operation || ''),
                      multiplyByPieces: false,
                    } : {}),
                  };
                }),
              })),
            })),
            fabrication: (item.fabrication || []).map(f => {
              const derivedRate = f.rate || (f.quantity > 0 && f.totalCost > 0 ? f.totalCost / f.quantity : 0);
              return {
                id: f.id,
                operation: f.operation || '',
                quantity: f.quantity || 0,
                unit: f.unit || 'ea',
                rate: derivedRate,
                unitPrice: derivedRate,
                totalCost: f.totalCost || 0,
              };
            }),
            snapshots: (item.snapshots || []).map(s => ({
              id: s.id,
              imageData: s.imageData || '',
              caption: s.caption || '',
              sortOrder: s.sortOrder || 0,
            })),
          };
        });
        setItems(loadedItems.map(item => ({
          ...item,
          materials: resequenceMaterials(item.materials).map(mat => {
            const calcMat = calculateMaterial(mat);
            return {
              ...calcMat,
              children: (calcMat.children || []).map(c => calculateMaterial(c)),
            };
          }),
        })));
        const expanded = {};
        loadedItems.forEach(item => { expanded[item.id] = true; });
        setExpandedItems(expanded);
      }

      // ── Offer to restore locally-stashed work newer than the server copy ──
      // A stash exists when a previous session died mid-save. If the server
      // copy has been saved since, the stash is stale and gets dropped.
      const stash = readStash(id);
      if (stash?.payload) {
        const stashTime = new Date(stash.savedAt).getTime();
        const serverTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
        if (stashTime > serverTime) {
          const restore = confirm(
            `Unsaved changes for this estimate were recovered from ${new Date(stash.savedAt).toLocaleString()} ` +
            `(newer than the last saved copy). Restore them?\n\n` +
            `Choosing Cancel discards the recovered changes.`
          );
          if (restore) {
            applyStashPayload(stash.payload);
            setIsDirty(true);
          } else {
            clearStash(id);
          }
        } else {
          clearStash(id);
        }
      }

      setCurrentProjectId(data.id);
      setTimeout(() => { isLoadedRef.current = true; }, 50);
    } catch (err) {
      console.error('Load error:', err);
      alert('Failed to load project. ' + err.message);
    }
  }, [applyStashPayload]);

  // ── SAVE PROJECT TO DATABASE ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!currentProjectId) return;
    const payload = {
        projectName,
        projectAddress,
        customerName,
        customerId: customerId || null,
        billingAddress,
        customerContact,
        customerPhone,
        customerEmail,
        estimateDate,
        bidDate: estimateDate ? new Date(estimateDate).toISOString() : null,
        bidTime: bidTime || '',
        estimatedBy,
        drawingDate,
        drawingRevision,
        architect,
        estimatorId: estimatorId || null,
        dashboardStatus: dashboardStatus || null,
        newOrCo: newOrCo || null,
        notes: notes || null,
        bidAmount: totals.grandTotal,
        typeStructural: projectTypes.structural,
        typeMiscellaneous: projectTypes.miscellaneous,
        typeOrnamental: projectTypes.ornamental,
        deliveryInstalled: deliveryOptions.installed,
        deliveryFobJobsite: deliveryOptions.fobJobsite,
        deliveryWillCall: deliveryOptions.willCall,
        taxCategory,
        nestingEnabled,
        nestKerfIn: parseFloat(nestKerfIn) || 0,
        nestEndCropIn: parseFloat(nestEndCropIn) || 0,
        stockLengthOverrides,
        breakoutGroups,
        items,
        adjustments,
        selectedExclusions,
        customExclusions,
        selectedQualifications,
        customQualifications,
        customRecapColumns,
        customProjectTypes,
        customDeliveryOptions: customDeliveryOptions.map(opt => ({
          text: opt,
          isSelected: selectedCustomDelivery === opt,
        })),
      };

    // Session known-dead: skip the network round-trip but keep the local stash
    // fresh, so edits made while logged out remain recoverable. Network saves
    // resume when the user logs back in and hits Retry.
    if (sessionExpiredRef.current) {
      writeStash(currentProjectId, payload);
      return;
    }

    try {
      setSaveStatus('saving');
      await apiFetch(`/api/projects/${currentProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      clearStash(currentProjectId);
      setSessionExpired(false);
      setSaveStatus('saved');
      setIsDirty(false);
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      if (err instanceof SessionExpiredError || (err instanceof ApiError && err.nonJson)) {
        // The save did not happen and retrying on a dead session won't help:
        // stash the work locally, keep the dirty flag, and pause autosave
        // until the user logs back in and retries.
        writeStash(currentProjectId, payload);
        setSessionExpired(true);
        setSaveStatus(null);
        return;
      }
      console.error('Save error:', err);
      setSaveStatus('error');
      alert('Failed to save project. ' + err.message);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [currentProjectId, projectName, projectAddress, customerName, customerId, billingAddress, customerContact, customerPhone, customerEmail, estimateDate, bidTime, estimatedBy, drawingDate, drawingRevision, architect, estimatorId, dashboardStatus, newOrCo, notes, projectTypes, deliveryOptions, taxCategory, nestingEnabled, nestKerfIn, nestEndCropIn, stockLengthOverrides, breakoutGroups, items, adjustments, selectedExclusions, customExclusions, selectedQualifications, customQualifications, customRecapColumns, customProjectTypes, customDeliveryOptions, selectedCustomDelivery]);

  // Keep saveRef pointing at the latest handleSave closure (no deps — runs every render)
  useEffect(() => { saveRef.current = handleSave; });

  // Dirty-tracking autosave: fires 3 s after any data change; skips during load
  // hydration. While the session is expired, handleSave short-circuits to a
  // local stash write instead of a network request, so this keeps running.
  useEffect(() => {
    if (!isLoadedRef.current) return;
    setIsDirty(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveRef.current?.();
    }, 3000);
    return () => clearTimeout(autoSaveTimerRef.current);
  }, [
    projectName, projectAddress, customerName, customerId, billingAddress,
    customerContact, customerPhone, customerEmail, estimateDate,
    bidTime, estimatedBy, drawingDate, drawingRevision, architect,
    estimatorId, dashboardStatus, newOrCo, notes,
    projectTypes, deliveryOptions, taxCategory,
    nestingEnabled, nestKerfIn, nestEndCropIn, stockLengthOverrides,
    breakoutGroups, items, adjustments,
    selectedExclusions, customExclusions,
    selectedQualifications, customQualifications,
    customRecapColumns,
    customProjectTypes, customDeliveryOptions, selectedCustomDelivery,
  ]);

  const handleStatusChange = useCallback(async (newStatus) => {
    if (!currentProjectId) return;
    const messages = {
      IN_REVIEW: 'Submit this estimate for review?',
      PUBLISHED: 'Are you sure you want to publish this estimate? It will become visible to Project Managers and Viewers.',
      REOPENED: 'This will hide the estimate from Viewers until it is re-published. Continue?',
      DRAFT: projectStatus === 'IN_REVIEW'
        ? 'Recall this submission? The estimate will return to Draft status.'
        : 'Reset this estimate back to Draft status?',
    };
    if (!confirm(messages[newStatus] || `Change status to ${newStatus}?`)) return;
    await saveRef.current?.();   // save any pending edits before changing status
    setStatusChanging(true);
    try {
      const result = await apiFetch(`/api/projects/${currentProjectId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setProjectStatus(result.status);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        setSessionExpired(true);
        alert('Your session has expired. Your changes are kept on this computer — log back in, then retry.');
      } else {
        alert(err.message || 'Failed to update status');
      }
    } finally {
      setStatusChanging(false);
    }
  }, [currentProjectId]);

  const canEdit = userRole === 'ADMIN' || (userRole === 'ESTIMATOR' && (projectStatus === 'DRAFT' || projectStatus === 'IN_REVIEW' || projectStatus === 'REOPENED'));
  const isReadOnly = !canEdit;

  // ── LOAD ON MOUNT ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (projectId) {
      handleLoad(projectId);
    }
  }, [projectId, handleLoad]);

  useEffect(() => {
    fetch('/api/dashboard/users')
      .then(r => r.ok ? r.json() : [])
      .then(list => setUsersList(list))
      .catch(() => {});
  }, []);

  // Toggle exclusion
  const toggleExclusion = (exclusion) => {
    setSelectedExclusions(prev =>
      prev.includes(exclusion) ? prev.filter(e => e !== exclusion) : [...prev, exclusion]
    );
  };

  // Add custom exclusion
  const addCustomExclusion = () => {
    if (newCustomExclusion.trim() && !customExclusions.includes(newCustomExclusion.trim())) {
      setCustomExclusions([...customExclusions, newCustomExclusion.trim()]);
      setNewCustomExclusion('');
    }
  };

  // Remove custom exclusion
  const removeCustomExclusion = (exclusion) => {
    setCustomExclusions(customExclusions.filter(e => e !== exclusion));
  };

  // Toggle qualification
  const toggleQualification = (qual) => {
    setSelectedQualifications(prev =>
      prev.includes(qual) ? prev.filter(q => q !== qual) : [...prev, qual]
    );
  };

  // Add custom qualification
  const addCustomQualification = () => {
    if (newCustomQualification.trim() && !customQualifications.includes(newCustomQualification.trim())) {
      setCustomQualifications([...customQualifications, newCustomQualification.trim()]);
      setNewCustomQualification('');
    }
  };

  // Remove custom qualification
  const removeCustomQualification = (qual) => {
    setCustomQualifications(customQualifications.filter(q => q !== qual));
  };

  // Custom project types
  const addCustomProjectType = () => {
    const v = newCustomProjectType.trim();
    if (v && !customProjectTypes.includes(v)) {
      setCustomProjectTypes([...customProjectTypes, v]);
      setNewCustomProjectType('');
    }
  };
  const removeCustomProjectType = (t) => setCustomProjectTypes(customProjectTypes.filter(x => x !== t));

  // Custom delivery options
  const addCustomDeliveryOption = () => {
    const v = newCustomDeliveryOption.trim();
    if (v && !customDeliveryOptions.includes(v)) {
      setCustomDeliveryOptions([...customDeliveryOptions, v]);
      setNewCustomDeliveryOption('');
    }
  };
  const removeCustomDeliveryOption = (opt) => {
    setCustomDeliveryOptions(customDeliveryOptions.filter(x => x !== opt));
    if (selectedCustomDelivery === opt) setSelectedCustomDelivery(null);
  };
  const selectCustomDelivery = (opt) => {
    setDeliveryOptions({ installed: false, fobJobsite: false, willCall: false });
    setSelectedCustomDelivery(opt);
  };

  // Breakout Group functions
  const addBreakoutGroup = () => {
    const newGroup = {
      id: Date.now(),
      name: '',
      type: 'base' // base, deduct, add
    };
    setBreakoutGroups([...breakoutGroups, newGroup]);
  };

  const updateBreakoutGroup = (groupId, field, value) => {
    setBreakoutGroups(breakoutGroups.map(g => g.id === groupId ? { ...g, [field]: value } : g));
  };

  const deleteBreakoutGroup = (groupId) => {
    // Unassign items from this group
    setItems(items.map(item => item.breakoutGroupId === groupId ? { ...item, breakoutGroupId: null } : item));
    setBreakoutGroups(breakoutGroups.filter(g => g.id !== groupId));
  };

  // Calculate item total
  // getItemTotal now imported from lib/estimating/totals (single implementation)

  // Calculate breakout totals
  const calculateBreakoutTotals = () => engineBreakoutTotals(items, breakoutGroups, adjustments);

  // Memoized breakout totals to avoid recalculating on every render
  const breakoutTotals = useMemo(() => calculateBreakoutTotals(), [items, breakoutGroups, adjustments]);

  // Adjustment functions
  const addAdjustment = () => {
    const newAdj = {
      id: Date.now(),
      amount: 0,
      note: ''
    };
    setAdjustments([...adjustments, newAdj]);
  };

  const updateAdjustment = (adjId, field, value) => {
    setAdjustments(adjustments.map(a => a.id === adjId ? { ...a, [field]: value } : a));
  };

  const deleteAdjustment = (adjId) => {
    setAdjustments(adjustments.filter(a => a.id !== adjId));
  };

  const getTotalAdjustments = () => {
    return adjustments.reduce((sum, adj) => sum + (parseFloat(adj.amount) || 0), 0);
  };

  // Get shapes for a category
  const getShapesForCategory = (category) => {
    const shapes = Object.keys(steelDatabase).filter(shape => steelDatabase[shape].category === category);
    if (category === 'Round Bar') {
      const parseDia = (name) => {
        const diaStr = name.split(' ')[1] || '0';
        const dash = diaStr.indexOf('-');
        if (dash === -1) {
          const slash = diaStr.indexOf('/');
          if (slash === -1) return parseFloat(diaStr);
          return parseFloat(diaStr.slice(0, slash)) / parseFloat(diaStr.slice(slash + 1));
        }
        const whole = parseFloat(diaStr.slice(0, dash));
        const [num, den] = diaStr.slice(dash + 1).split('/').map(Number);
        return whole + num / den;
      };
      return shapes.sort((a, b) => parseDia(a) - parseDia(b));
    }
    if (category === 'Pipe') {
      // Parse 'PIPE 1-1/2 STD' -> numeric diameter (1.5) for sorting
      const parseDia = (name) => {
        const diaStr = name.split(' ')[1] || '0';
        const dash = diaStr.indexOf('-');
        if (dash === -1) return parseFloat(diaStr);
        const whole = parseFloat(diaStr.slice(0, dash));
        const [num, den] = diaStr.slice(dash + 1).split('/').map(Number);
        return whole + num / den;
      };
      const gradeOrder = { STD: 0, XS: 1, XXS: 2 };
      return shapes.sort((a, b) => {
        const dDiff = parseDia(a) - parseDia(b);
        if (dDiff !== 0) return dDiff;
        return (gradeOrder[a.split(' ')[2]] ?? 99) - (gradeOrder[b.split(' ')[2]] ?? 99);
      });
    }
    return shapes;
  };

  // Calculate material values
  const calculateMaterial = (material) =>
    engineCalculateMaterial(material, { stockLengthsFor: availableLengthsFor });

  // CSV Import Functions
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      processCSVContent(content);
    };
    reader.onerror = () => {
      setImportError('Failed to read file');
    };
    reader.readAsText(file);
    
    // Reset file input so same file can be selected again
    event.target.value = '';
  };

  const processCSVContent = (content) => {
    setImportError(null);
    
    // Parse CSV
    const parseResult = parseRevuCSV(content);
    
    if (parseResult.error) {
      setImportError(parseResult.error);
      setImportPreview(null);
      setShowImportModal(true);
      return;
    }
    
    if (parseResult.rows.length === 0) {
      setImportError('No valid material rows found. Ensure rows have Mat Size and Fab Length values.');
      setImportPreview(null);
      setShowImportModal(true);
      return;
    }
    
    // Aggregate data
    const aggregated = aggregateImportData(parseResult.rows);
    
    setImportPreview(aggregated);
    setShowImportModal(true);
  };

  const executeImport = () => {
    if (!importPreview || !importPreview.items) return;
    
    let updatedItems = [...items];
    let newExpandedItems = { ...expandedItems };
    
    for (const importItem of importPreview.items) {
      // Find existing item by item number
      const existingIndex = updatedItems.findIndex(
        item => item.itemNumber === importItem.itemNumber
      );
      
      if (existingIndex !== -1) {
        // Update existing item (merge logic)
        const existingItem = updatedItems[existingIndex];
        let updatedMaterials = [...existingItem.materials];
        
        for (const importMat of importItem.materials) {
          // Find matching material line
          const matIndex = updatedMaterials.findIndex(
            m => m.size === importMat.size && 
                 m.length === importMat.length && 
                 m.description === importMat.description
          );
          
          if (matIndex !== -1) {
            // Replace quantity (preserve prices)
            updatedMaterials[matIndex] = calculateMaterial({
              ...updatedMaterials[matIndex],
              pieces: importMat.pieces
            });
          } else {
            // Add new material line with sequence
            const nextSeq = getNextParentSequence(updatedMaterials);
            const newMat = {
              id: Date.now() + Math.random(),
              sequence: nextSeq,
              parentMaterialId: null,
              description: importMat.description,
              category: importMat.category,
              size: importMat.size,
              customWeight: importMat.category === 'Custom' ? 0 : null,
              pieces: importMat.pieces,
              length: importMat.length,
              stockLength: null,
              priceBy: 'LB',
              unitPrice: 0,
              galvanized: false,
              fabrication: []
            };
            updatedMaterials.push(calculateMaterial(newMat));
          }
        }
        
        // Append drawing references
        let drawingRefs = existingItem.drawingRef ? existingItem.drawingRef.split(',').map(s => s.trim()) : [];
        const newRefs = importItem.drawingRef ? importItem.drawingRef.split(',').map(s => s.trim()) : [];
        for (const ref of newRefs) {
          if (ref && !drawingRefs.includes(ref)) {
            drawingRefs.push(ref);
          }
        }
        drawingRefs.sort((a, b) => parseInt(a) - parseInt(b));
        
        updatedItems[existingIndex] = {
          ...existingItem,
          itemName: existingItem.itemName === 'New Item' ? importItem.itemName : existingItem.itemName,
          drawingRef: drawingRefs.join(', '),
          materials: updatedMaterials
        };
        
        // Expand updated item
        newExpandedItems[existingItem.id] = true;
        
      } else {
        // Create new item with sequenced materials
        const newId = Date.now() + Math.random();
        let seqIndex = 0;
        const newMaterials = importItem.materials.map(mat => {
          const seq = toAlphaSeq(seqIndex + 1); // A, B, … Z, AA, AB…
          seqIndex++;
          const newMat = {
            id: Date.now() + Math.random(),
            sequence: seq,
            parentMaterialId: null,
            description: mat.description,
            category: mat.category,
            size: mat.size,
            customWeight: mat.category === 'Custom' ? 0 : null,
            pieces: mat.pieces,
            length: mat.length,
            stockLength: null,
            priceBy: 'LB',
            unitPrice: 0,
            galvanized: false,
            fabrication: []
          };
          return calculateMaterial(newMat);
        });
        
        const newItem = {
          id: newId,
          itemNumber: importItem.itemNumber,
          itemName: importItem.itemName,
          drawingRef: importItem.drawingRef,
          breakoutGroupId: null,
          materialMarkup: 0, // Material markup percentage
          fabMarkup: 0, // Fabrication markup percentage
          materials: newMaterials,
          fabrication: [],
          recapCosts: {
            installation: { cost: 0, markup: 0, total: 0 },
            drafting: { cost: 0, markup: 0, total: 0 },
            engineering: { cost: 0, markup: 0, total: 0 },
            projectManagement: { hours: 0, rate: 60, total: 0 },
            shipping: { cost: 0, markup: 0, total: 0 }
          }
        };
        
        updatedItems.push(newItem);
        newExpandedItems[newId] = true;
      }
    }
    
    // Sort items by item number
    updatedItems.sort((a, b) => a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric: true }));

    setItems(updatedItems.map(item => ({ ...item, materials: resequenceMaterials(item.materials) })));
    setExpandedItems(newExpandedItems);
    setShowImportModal(false);
    setImportPreview(null);
    setImportError(null);
  };

  const cancelImport = () => {
    setShowImportModal(false);
    setImportPreview(null);
    setImportError(null);
  };

  // ── TAKEOFF CSV IMPORT (Neilsoft 19-column) ─────────────────────────────────

  const handleTakeoffFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    setTakeoffImporting(true);
    setTakeoffError(null);
    setTakeoffPreview(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      let data;
      try {
        data = await apiFetch('/api/import-csv', {
          method: 'POST',
          body: formData,
        });
      } catch (err) {
        if (err instanceof SessionExpiredError) setSessionExpired(true);
        setTakeoffError(err instanceof SessionExpiredError
          ? 'Your session has expired — log back in, then re-upload the file.'
          : (err.message || 'Failed to process CSV file'));
        setTakeoffPreview(null);
        setTakeoffImporting(false);
        return;
      }

      if (!data.success) {
        setTakeoffError(data.error || 'Failed to process CSV file');
        setTakeoffPreview(null);
      } else {
        // Run the same size translation the import will perform, so sizes that
        // would silently become Custom (zero weight, zero cost) are surfaced
        // in the preview instead of hiding in the imported estimate.
        const unmatched = new Map(); // size string -> { size, rowCount, locations[] }
        const walkMembers = (members, itemNumber) => {
          for (const m of members) {
            if (m.size && !translateSizeToAISC(m.size).matched) {
              const entry = unmatched.get(m.size) || { size: m.size, rowCount: 0, locations: [] };
              entry.rowCount += 1;
              const loc = `Item ${itemNumber} / Mark ${m.mark}`;
              if (!entry.locations.includes(loc)) entry.locations.push(loc);
              unmatched.set(m.size, entry);
            }
            if (m.children?.length) walkMembers(m.children, itemNumber);
          }
        };
        for (const it of data.items || []) walkMembers(it.members || [], it.itemNumber);
        setTakeoffPreview({ ...data, unmatchedSizes: Array.from(unmatched.values()) });
        setTakeoffError(null);
      }
    } catch (err) {
      setTakeoffError('Network error: ' + err.message);
      setTakeoffPreview(null);
    } finally {
      setTakeoffImporting(false);
      setShowTakeoffModal(true);
    }
  };

  const cancelTakeoffImport = () => {
    setShowTakeoffModal(false);
    setTakeoffPreview(null);
    setTakeoffError(null);
  };

  const executeTakeoffImport = () => {
    if (!takeoffPreview || !takeoffPreview.items) return;

    let updatedItems = [...items];
    let newExpandedItems = { ...expandedItems };

    for (const importItem of takeoffPreview.items) {
      // Build flat materials list from all members (parents first, then children)
      const flatMaterials = [];
      let seqIndex = 0;
      const parentIdMap = new Map(); // mark -> generated material id

      const processMember = (member, parentMaterialId) => {
        const translated = translateSizeToAISC(member.size);
        const seq = toAlphaSeq(seqIndex + 1); // interim — resequenceMaterials normalizes after import
        seqIndex++;

        const matId = Date.now() + Math.random();
        const newMat = {
          id: matId,
          sequence: seq,
          parentMaterialId: parentMaterialId || null,
          description: member.description || translated.size || member.size,
          category: translated.category,
          size: translated.size || member.size,
          customWeight: translated.category === 'Custom' ? 0 : null,
          pieces: member.pieces || 1,
          length: member.length || 0,
          stockLength: null,
          priceBy: 'LB',
          unitPrice: 0,
          galvanized: member.galvanized || false,
          // Plate dimensions — dual fields: frontend calc + DB save
          plateThickness: translated.plateThickness || null,
          plateWidth: translated.plateWidth || null,
          thickness: translated.plateThickness || null,
          width: translated.plateWidth || null,
          fabrication: (member.fabrication || []).map(op => {
            const qty = op.quantity || 0;
            const rate = op.rate || 0;
            const connWeight = op.connWeight || null;
            return {
              id: Date.now() + Math.random(),
              operation: op.operation,
              quantity: qty,
              unit: op.unit || 'EA',
              length: null,
              unitPrice: rate,
              totalCost: qty * rate,
              connWeight,
              galvanized: false,
              galvWeight: null,
              isGalvLine: false,
            };
          }),
        };
        const calcMat = calculateMaterial(newMat);
        // Auto-generate galv fab row when import marks material as galvanized
        if (calcMat.galvanized) {
          calcMat.fabrication.push({
            id: Date.now() + Math.random(),
            operation: 'Galvanizing',
            connectTo: 'apply',
            description: `Galv - ${calcMat.description || calcMat.size}`,
            quantity: calcMat.fabWeight || 0,
            unit: 'LB',
            unitPrice: 0,
            multiplyByPieces: false,
            totalCost: 0,
            isAutoGalv: true
          });
        }
        flatMaterials.push(calcMat);
        parentIdMap.set(member.mark, matId);

        // Process children
        if (member.children && member.children.length > 0) {
          for (const child of member.children) {
            processMember(child, matId);
          }
        }
      };

      for (const member of importItem.members) {
        processMember(member, null);
      }

      // Build item-level fabrication (uniform coating)
      const itemFab = [];
      if (importItem.coatingUniform) {
        itemFab.push({
          id: Date.now() + Math.random(),
          operation: importItem.coatingUniform,
          quantity: 1,
          unit: 'EA',
          length: null,
          unitPrice: 0,
          totalCost: 0,
          connWeight: null,
          galvanized: false,
          galvWeight: null,
          isGalvLine: false,
        });
      }

      // Find or create item
      const existingIndex = updatedItems.findIndex(
        item => item.itemNumber === importItem.itemNumber
      );

      if (existingIndex !== -1) {
        const existingItem = updatedItems[existingIndex];
        let updatedMaterials = [...existingItem.materials];

        // Merge: matching lines (size + length + description) take the
        // imported quantity — the takeoff is the source of truth for counts —
        // while pricing and fab ops on the existing line are preserved.
        // New lines are added. Lines only in the estimate are left alone
        // (they may be manual), so delete the item first for a clean
        // revision re-import.
        for (const mat of flatMaterials) {
          const matchIdx = updatedMaterials.findIndex(
            m => m.size === mat.size &&
                 m.length === mat.length &&
                 m.description === mat.description
          );
          if (matchIdx === -1) {
            updatedMaterials.push({ ...mat, fabrication: (mat.fabrication || []).map(f => ({ ...f })) });
          } else if ((updatedMaterials[matchIdx].pieces || 0) !== (mat.pieces || 0)) {
            const updated = calculateMaterial({ ...updatedMaterials[matchIdx], pieces: mat.pieces || 0 });
            if (updated.galvanized) {
              updated.fabrication = (updated.fabrication || []).map(f => f.isAutoGalv
                ? { ...f, quantity: updated.fabWeight || 0, totalCost: (updated.fabWeight || 0) * (f.unitPrice || 0) }
                : f);
            }
            updatedMaterials[matchIdx] = updated;
          }
        }

        // Merge item-level fab ops (no duplicates)
        let updatedFab = [...(existingItem.fabrication || [])];
        for (const op of itemFab) {
          const exists = updatedFab.some(f => f.operation === op.operation);
          if (!exists) updatedFab.push({ ...op });
        }

        updatedItems[existingIndex] = {
          ...existingItem,
          itemName: existingItem.itemName === 'New Item' ? importItem.itemName : existingItem.itemName,
          drawingRef: (() => {
            const existing = existingItem.drawingRef ? existingItem.drawingRef.split(',').map(s => s.trim()) : [];
            const incoming = importItem.drawingRef ? importItem.drawingRef.split(',').map(s => s.trim()) : [];
            const merged = [...new Set([...existing, ...incoming].filter(Boolean))];
            return merged.join(', ');
          })(),
          materials: updatedMaterials,
          fabrication: updatedFab,
        };
        newExpandedItems[existingItem.id] = true;

      } else {
        const newId = Date.now() + Math.random();
        const newItem = {
          id: newId,
          itemNumber: importItem.itemNumber,
          itemName: importItem.itemName,
          drawingRef: importItem.drawingRef,
          breakoutGroupId: null,
          materialMarkup: 0,
          fabMarkup: 0,
          materials: flatMaterials,
          fabrication: itemFab,
          recapCosts: {
            installation: { cost: 0, markup: 0, total: 0 },
            drafting: { cost: 0, markup: 0, total: 0 },
            engineering: { cost: 0, markup: 0, total: 0 },
            projectManagement: { hours: 0, rate: 60, total: 0 },
            shipping: { cost: 0, markup: 0, total: 0 },
          },
        };
        updatedItems.push(newItem);
        newExpandedItems[newId] = true;
      }
    }

    // Sort items numerically
    updatedItems.sort((a, b) =>
      a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric: true })
    );

    setItems(updatedItems);
    setExpandedItems(newExpandedItems);
    setShowTakeoffModal(false);
    setTakeoffPreview(null);
    setTakeoffError(null);
  };

  // Item functions
  const addItem = () => {
    const newId = Date.now();
    const newItem = {
      id: newId,
      itemNumber: String(items.length + 1).padStart(3, '0'),
      itemName: 'New Item',
      drawingRef: '',
      breakoutGroupId: null,
      materialMarkup: 0, // Material markup percentage
      fabMarkup: 0, // Fabrication markup percentage
      materials: [],
      fabrication: [],
      recapCosts: {
        installation: { cost: 0, markup: 0, total: 0 },
        drafting: { cost: 0, markup: 0, total: 0 },
        engineering: { cost: 0, markup: 0, total: 0 },
        projectManagement: { hours: 0, rate: 60, total: 0 },
        shipping: { cost: 0, markup: 0, total: 0 }
      },
      snapshots: [],
    };
    setItems([...items, newItem]);
    setExpandedItems({ ...expandedItems, [newId]: true });
  };

  const deleteItem = (itemId) => {
    setItems(items.filter(item => item.id !== itemId));
  };

  const updateItem = (itemId, field, value) => {
    setItems(items.map(item => item.id === itemId ? { ...item, [field]: value } : item));
  };

  const toggleItemExpansion = (itemId) => {
    setExpandedItems({ ...expandedItems, [itemId]: !expandedItems[itemId] });
  };

  // Material functions
  // Get next parent sequence letter (A, B, C, ...)
  const getNextParentSequence = (materials) => {
    const parentSeqs = materials
      .filter(m => !m.parentMaterialId)
      .map(m => parseAlphaSeq(m.sequence))
      .filter(n => n > 0);
    if (parentSeqs.length === 0) return 'A';
    return toAlphaSeq(Math.max(...parentSeqs) + 1);
  };

  // Get next child sequence (Aa, Ab, ...)
  const getNextChildSequence = (materials, parentId) => {
    const parent = materials.find(m => m.id === parentId);
    if (!parent) return 'Aa';
    const parentSeq = parent.sequence || 'A';
    const childSeqs = materials
      .filter(m => m.parentMaterialId === parentId)
      .map(m => m.sequence)
      .filter(s => s && s.startsWith(parentSeq))
      .map(s => parseChildAlphaSuffix(s.slice(parentSeq.length)));
    const nextNum = childSeqs.length === 0 ? 1 : Math.max(...childSeqs) + 1;
    return `${parentSeq}${toChildAlphaSuffix(nextNum)}`;
  };

  // Get children of a parent material
  const getChildMaterials = (materials, parentId) => {
    return materials.filter(m => m.parentMaterialId === parentId);
  };

  // Get parent materials only
  const getParentMaterials = (materials) => {
    return materials.filter(m => !m.parentMaterialId);
  };

  // Re-sequence materials: parents get A…Z, AA, AB…; children get the parent
  // seq plus a lowercase suffix (Aa, Ab…). Letters only — never overflows
  // into symbols. Also rebuilds array in normalized order
  // (parent → children → parent → children).
  const resequenceMaterials = (materials) => {
    const parents = materials.filter(m => !m.parentMaterialId);
    const result = [];
    parents.forEach((parent, idx) => {
      const letter = toAlphaSeq(idx + 1);
      result.push({ ...parent, sequence: letter });
      const children = materials.filter(m => m.parentMaterialId === parent.id);
      children.forEach((child, childIdx) => {
        result.push({ ...child, sequence: `${letter}${toChildAlphaSuffix(childIdx + 1)}` });
      });
    });
    return result;
  };

  // ── Per-item material organization ──────────────────────────────────────────
  // One-time reorder of an item's material lines by the chosen preset.
  // Attachments travel with their parent; resequencing reassigns A, B, C…
  const sortItemMaterials = (itemId, presetKey) => {
    const preset = MATERIAL_SORT_PRESETS[presetKey];
    if (!preset) return;
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const parents = getParentMaterials(item.materials);
      const sorted = [...parents].sort((a, b) => {
        for (const k of preset.keys) {
          const cmp = String(a[k] || '').localeCompare(String(b[k] || ''), undefined, { numeric: true, sensitivity: 'base' });
          if (cmp !== 0) return cmp;
        }
        return (b.length || 0) - (a.length || 0); // longest first within a group
      });
      const rebuilt = sorted.flatMap(p => [p, ...getChildMaterials(item.materials, p.id)]);
      return { ...item, materials: resequenceMaterials(rebuilt) };
    }));
  };

  // Merge an item's duplicate parent lines: same category, size, length,
  // description, galv, pricing, and fab-op signature (operation/unit/rate).
  // Pieces and fab-op quantities sum; attachments move to the surviving line.
  // Complements the importer, which only consolidates within a single import.
  const mergeDuplicateItemMaterials = (itemId) => {
    const fabSig = (mat) => (mat.fabrication || [])
      .filter(f => !f.isAutoGalv && !f.isConnGalv) // auto rows regenerate from weight
      .map(f => `${f.operation}|${f.unit}|${f.unitPrice || 0}`)
      .sort().join('~~');
    const keyOf = (m) => JSON.stringify([
      m.category, m.size, +(m.length || 0).toFixed(4),
      (m.description || '').trim().toLowerCase(), !!m.galvanized,
      m.priceBy, m.unitPrice || 0, fabSig(m),
    ]);

    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const groups = new Map();
    getParentMaterials(item.materials).forEach(p => {
      const k = keyOf(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    const dupGroups = [...groups.values()].filter(g => g.length > 1);
    if (dupGroups.length === 0) {
      alert('No duplicate material lines on this item.\n\nLines merge only when category, size, length, description, galv, pricing, and fab operations all match.');
      return;
    }
    const removedCount = dupGroups.reduce((s, g) => s + g.length - 1, 0);
    if (!confirm(`Merge ${removedCount} duplicate line${removedCount === 1 ? '' : 's'} into ${dupGroups.length} surviving line${dupGroups.length === 1 ? '' : 's'}?\n\nQuantities and fab-op quantities are summed; attachments move to the surviving line.`)) return;

    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const groupsNow = new Map();
      getParentMaterials(it.materials).forEach(p => {
        const k = keyOf(p);
        if (!groupsNow.has(k)) groupsNow.set(k, []);
        groupsNow.get(k).push(p);
      });

      const removeIds = new Set();
      const reparent = new Map();   // duplicate parent id -> survivor id
      const mergedById = new Map(); // survivor id -> recalculated merged line
      for (const g of groupsNow.values()) {
        if (g.length < 2) continue;
        const [survivor, ...rest] = g;
        let pieces = survivor.pieces || 0;
        let fab = (survivor.fabrication || []).map(f => ({ ...f }));
        for (const dup of rest) {
          pieces += dup.pieces || 0;
          (dup.fabrication || []).forEach(df => {
            if (df.isAutoGalv || df.isConnGalv) return;
            const idx = fab.findIndex(f => !f.isAutoGalv && !f.isConnGalv &&
              f.operation === df.operation && f.unit === df.unit &&
              (f.unitPrice || 0) === (df.unitPrice || 0));
            if (idx !== -1) {
              const qty = (fab[idx].quantity || 0) + (df.quantity || 0);
              fab[idx] = { ...fab[idx], quantity: qty, totalCost: qty * (fab[idx].unitPrice || 0) };
            }
          });
          removeIds.add(dup.id);
          reparent.set(dup.id, survivor.id);
        }
        const merged = calculateMaterial({ ...survivor, pieces, fabrication: fab });
        if (merged.galvanized) {
          merged.fabrication = (merged.fabrication || []).map(f => f.isAutoGalv
            ? { ...f, quantity: merged.fabWeight || 0, totalCost: (merged.fabWeight || 0) * (f.unitPrice || 0) }
            : f);
        }
        mergedById.set(survivor.id, merged);
      }

      const newMaterials = it.materials
        .filter(m => !removeIds.has(m.id))
        .map(m => {
          if (mergedById.has(m.id)) return mergedById.get(m.id);
          if (m.parentMaterialId && reparent.has(m.parentMaterialId)) {
            return { ...m, parentMaterialId: reparent.get(m.parentMaterialId) };
          }
          return m;
        });
      return { ...it, materials: resequenceMaterials(newMaterials) };
    }));
  };

  const addMaterial = (itemId) => {
    setItems(items.map(item => {
      if (item.id !== itemId) return item;
      const nextSeq = getNextParentSequence(item.materials);
      const newMaterial = {
        id: Date.now() + Math.random(),
        sequence: nextSeq,
        parentMaterialId: null, // This is a parent material
        description: '',
        category: 'W Shape',
        size: 'W18x35',
        customWeight: null,
        pieces: 1,
        length: 20,
        stockLength: null,
        priceBy: 'LB',
        unitPrice: 0,
        galvanized: false,
        fabrication: [] // Nested fabrication for this material
      };
      return { ...item, materials: [...item.materials, calculateMaterial(newMaterial)] };
    }));
  };

  // Add child material (attachment) to a parent
  const addChildMaterial = (itemId, parentMaterialId) => {
    setItems(items.map(item => {
      if (item.id !== itemId) return item;
      const parent = item.materials.find(m => m.id === parentMaterialId);
      if (!parent) return item;
      
      const nextSeq = getNextChildSequence(item.materials, parentMaterialId);
      const newMaterial = {
        id: Date.now() + Math.random(),
        sequence: nextSeq,
        parentMaterialId: parentMaterialId,
        description: '',
        category: 'Plate',
        size: '',
        plateThickness: 0.5,
        plateWidth: 6,
        thickness: 0.5,
        width: 6,
        customWeight: null,
        pieces: parent.pieces || 1, // Inherit from parent
        inheritPieces: true, // Flag to inherit piece count
        length: 1,
        stockLength: null,
        priceBy: 'LB',
        unitPrice: 0,
        galvanized: false,
        fabrication: [] // Nested fabrication for this material
      };
      return { ...item, materials: [...item.materials, calculateMaterial(newMaterial)] };
    }));
  };

  const updateMaterial = (itemId, materialId, field, value) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        let updatedMaterials = item.materials.map(mat => {
          if (mat.id === materialId) {
            let updated = { ...mat, [field]: value };
            if (field === 'category') {
              const shapes = getShapesForCategory(value);
              updated.size = shapes.length > 0 ? shapes[0] : '';
              updated.customWeight = null;
              updated.stockLength = null; // Reset to auto-calculate for new category
            }
            // If child material changes pieces, turn off inheritance
            if (field === 'pieces' && mat.parentMaterialId) {
              updated.inheritPieces = false;
            }
            
            // Calculate material first to get fabWeight
            updated = calculateMaterial(updated);
            
            // Handle galvanizing automation (now in material.fabrication)
            let matFab = [...(updated.fabrication || [])];
            
            if (field === 'galvanized') {
              const galvFabIndex = matFab.findIndex(f => f.isAutoGalv);
              
              if (value === true) {
                // Add galvanizing fabrication to this material
                if (galvFabIndex === -1) {
                  matFab.push({
                    id: Date.now(),
                    operation: 'Galvanizing',
                    connectTo: 'apply',
                    description: `Galv - ${updated.description || updated.size}`,
                    quantity: updated.fabWeight || 0,
                    unit: 'LB',
                    unitPrice: 0,
                    multiplyByPieces: false, // Weight already includes pieces
                    totalCost: 0,
                    isAutoGalv: true
                  });
                }
              } else {
                // Remove galvanizing fabrication
                if (galvFabIndex !== -1) {
                  matFab.splice(galvFabIndex, 1);
                }
              }
            } else if (['pieces', 'length', 'size', 'customWeight', 'category', 'description', 'plateThickness', 'plateWidth'].includes(field)) {
              // Update galvanizing qty if material weight changes and galv is enabled
              if (updated.galvanized) {
                const galvFabIndex = matFab.findIndex(f => f.isAutoGalv);
                if (galvFabIndex !== -1) {
                  matFab[galvFabIndex] = {
                    ...matFab[galvFabIndex],
                    quantity: updated.fabWeight || 0,
                    description: `Galv - ${updated.description || updated.size}`,
                    totalCost: (updated.fabWeight || 0) * (matFab[galvFabIndex].unitPrice || 0)
                  };
                }
              }
              
              // Update connection weights when size or category changes
              if (field === 'size' || field === 'category') {
                matFab = matFab.map(fab => {
                  if (CONNECTION_WEIGHT_OPS.has(fab.operation)) {
                    const newConnWeight = getConnectionWeight(updated.size, updated.category);
                    const qty = fab.quantity || 0;
                    const rate = fab.unitPrice || 0;
                    const newGalvWeight = fab.galvanized ? qty * newConnWeight : null;
                    // If unit is LB, multiply by connWeight; if EA, just qty × rate
                    const newTotal = fab.unit === 'LB' ? qty * newConnWeight * rate : qty * rate;
                    return { 
                      ...fab, 
                      connWeight: newConnWeight,
                      galvWeight: newGalvWeight,
                      totalCost: newTotal
                    };
                  }
                  // Update linked connection galv line
                  if (fab.isConnGalv && fab.parentFabId) {
                    const parentFab = matFab.find(f => f.id === fab.parentFabId);
                    if (parentFab && parentFab.galvWeight) {
                      return {
                        ...fab,
                        quantity: parentFab.galvWeight,
                        totalCost: parentFab.galvWeight * (fab.unitPrice || 0)
                      };
                    }
                  }
                  return fab;
                });
                
                // Second pass to update galv lines with new parent galvWeight
                matFab = matFab.map(fab => {
                  if (fab.isConnGalv && fab.parentFabId) {
                    const parentFab = matFab.find(f => f.id === fab.parentFabId);
                    if (parentFab) {
                      const newQty = parentFab.galvWeight || 0;
                      return {
                        ...fab,
                        quantity: newQty,
                        totalCost: newQty * (fab.unitPrice || 0)
                      };
                    }
                  }
                  return fab;
                });
              }
              
              // Recalculate all material fab totals when pieces change
              if (field === 'pieces') {
                matFab = matFab.map(fab => {
                  if (fab.isAutoGalv) return fab; // Galv already handled
                  const baseQty = fab.quantity || 0;
                  const finalQty = fab.multiplyByPieces ? baseQty * (updated.pieces || 1) : baseQty;
                  return { ...fab, totalCost: finalQty * (fab.unitPrice || 0) };
                });
              }
            }
            
            updated.fabrication = matFab;
            return updated;
          }
          return mat;
        });
        
        // If parent pieces changed, update children with inheritPieces=true
        const updatedMat = updatedMaterials.find(m => m.id === materialId);
        if (field === 'pieces' && updatedMat && !updatedMat.parentMaterialId) {
          updatedMaterials = updatedMaterials.map(mat => {
            if (mat.parentMaterialId === materialId && mat.inheritPieces) {
              let childUpdated = calculateMaterial({ ...mat, pieces: value });
              // Recalculate child fab totals
              if (childUpdated.fabrication) {
                childUpdated.fabrication = childUpdated.fabrication.map(fab => {
                  if (fab.isAutoGalv) {
                    // Update galv weight
                    return { ...fab, quantity: childUpdated.fabWeight || 0, totalCost: (childUpdated.fabWeight || 0) * (fab.unitPrice || 0) };
                  }
                  const baseQty = fab.quantity || 0;
                  const finalQty = fab.multiplyByPieces ? baseQty * (childUpdated.pieces || 1) : baseQty;
                  return { ...fab, totalCost: finalQty * (fab.unitPrice || 0) };
                });
              }
              return childUpdated;
            }
            return mat;
          });
        }
        
        return { ...item, materials: updatedMaterials };
      }
      return item;
    }));
  };

  const deleteMaterial = (itemId, materialId) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        // Get IDs of material and all its children
        const idsToDelete = [materialId];
        const childIds = item.materials
          .filter(m => m.parentMaterialId === materialId)
          .map(m => m.id);
        idsToDelete.push(...childIds);

        const remaining = item.materials.filter(m => !idsToDelete.includes(m.id));
        return { ...item, materials: resequenceMaterials(remaining) };
      }
      return item;
    }));
  };

  // Drag-and-drop reordering for materials
  const dragRef = useRef({ sourceId: null, sourceItemId: null, isParent: false });
  const [dropTarget, setDropTarget] = useState(null); // { materialId, position: 'before'|'after' }

  const handleDragStart = (e, itemId, materialId, isParent) => {
    dragRef.current = { sourceId: materialId, sourceItemId: itemId, isParent };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
  };

  const handleDragOver = (e, itemId, targetId, targetIsParent, targetParentId) => {
    e.preventDefault();
    const { sourceId, sourceItemId, isParent: sourceIsParent } = dragRef.current;
    if (!sourceId || sourceItemId !== itemId) return;
    // Parents can only drag among parents; children only within same parent
    if (sourceIsParent !== targetIsParent) return;
    if (!sourceIsParent) {
      // Children must share the same parent
      const item = items.find(i => i.id === itemId);
      const sourceMat = item?.materials.find(m => m.id === sourceId);
      if (sourceMat?.parentMaterialId !== targetParentId) return;
    }
    if (sourceId === targetId) { setDropTarget(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    setDropTarget({ materialId: targetId, position });
  };

  const handleDrop = (e, itemId) => {
    e.preventDefault();
    const { sourceId, isParent: sourceIsParent } = dragRef.current;
    if (!sourceId || !dropTarget) { setDropTarget(null); return; }

    setItems(items.map(item => {
      if (item.id !== itemId) return item;
      let mats = [...item.materials];
      if (sourceIsParent) {
        mats = reorderParent(mats, sourceId, dropTarget.materialId, dropTarget.position);
      } else {
        mats = reorderChild(mats, sourceId, dropTarget.materialId, dropTarget.position);
      }
      return { ...item, materials: resequenceMaterials(mats) };
    }));
    setDropTarget(null);
    dragRef.current = { sourceId: null, sourceItemId: null, isParent: false };
  };

  const handleDragEnd = () => {
    setDropTarget(null);
    dragRef.current = { sourceId: null, sourceItemId: null, isParent: false };
  };

  const reorderParent = (materials, sourceId, targetId, position) => {
    // Collect parent groups (parent + its children) in current order
    const parents = materials.filter(m => !m.parentMaterialId);
    const groups = parents.map(p => ({
      parent: p,
      children: materials.filter(m => m.parentMaterialId === p.id)
    }));
    // Remove source group
    const srcIdx = groups.findIndex(g => g.parent.id === sourceId);
    const [srcGroup] = groups.splice(srcIdx, 1);
    // Find target index and insert
    const tgtIdx = groups.findIndex(g => g.parent.id === targetId);
    const insertIdx = position === 'before' ? tgtIdx : tgtIdx + 1;
    groups.splice(insertIdx, 0, srcGroup);
    // Flatten back
    return groups.flatMap(g => [g.parent, ...g.children]);
  };

  const reorderChild = (materials, sourceId, targetId, position) => {
    const sourceMat = materials.find(m => m.id === sourceId);
    const parentId = sourceMat.parentMaterialId;
    // Get children of the same parent in current order
    const children = materials.filter(m => m.parentMaterialId === parentId);
    const srcIdx = children.findIndex(c => c.id === sourceId);
    const [srcChild] = children.splice(srcIdx, 1);
    const tgtIdx = children.findIndex(c => c.id === targetId);
    const insertIdx = position === 'before' ? tgtIdx : tgtIdx + 1;
    children.splice(insertIdx, 0, srcChild);
    // Rebuild materials: keep everything except this parent's children, then re-insert children after parent
    const withoutChildren = materials.filter(m => m.parentMaterialId !== parentId);
    const parentIdx = withoutChildren.findIndex(m => m.id === parentId);
    const result = [...withoutChildren];
    result.splice(parentIdx + 1, 0, ...children);
    return result;
  };

  // Drag-and-drop reordering for fab ops
  const fabDragRef = useRef({ sourceFabId: null, sourceItemId: null, sourceMaterialId: null });
  const [fabDropTarget, setFabDropTarget] = useState(null); // { fabId, position: 'before'|'after' }

  const handleFabDragStart = (e, itemId, materialId, fabId) => {
    e.stopPropagation(); // Don't trigger parent row drag
    fabDragRef.current = { sourceFabId: fabId, sourceItemId: itemId, sourceMaterialId: materialId };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };

  const handleFabDragOver = (e, itemId, materialId, targetFabId) => {
    e.preventDefault();
    e.stopPropagation();
    const { sourceFabId, sourceItemId, sourceMaterialId } = fabDragRef.current;
    if (!sourceFabId || sourceItemId !== itemId || sourceMaterialId !== materialId) return;
    if (sourceFabId === targetFabId) { setFabDropTarget(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    setFabDropTarget({ fabId: targetFabId, position });
  };

  const handleFabDrop = (e, itemId, materialId) => {
    e.preventDefault();
    e.stopPropagation();
    const { sourceFabId } = fabDragRef.current;
    if (!sourceFabId || !fabDropTarget) { setFabDropTarget(null); return; }

    setItems(items.map(item => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        materials: item.materials.map(mat => {
          if (mat.id !== materialId) return mat;
          const fabs = [...(mat.fabrication || [])];
          // Only reorder non-galv fabs; galv stays at end
          const draggable = fabs.filter(f => !f.isAutoGalv && !f.isConnGalv);
          const galvRows = fabs.filter(f => f.isAutoGalv || f.isConnGalv);
          const srcIdx = draggable.findIndex(f => f.id === sourceFabId);
          if (srcIdx === -1) return mat;
          const [srcFab] = draggable.splice(srcIdx, 1);
          const tgtIdx = draggable.findIndex(f => f.id === fabDropTarget.fabId);
          const insertIdx = fabDropTarget.position === 'before' ? tgtIdx : tgtIdx + 1;
          draggable.splice(insertIdx, 0, srcFab);
          return { ...mat, fabrication: [...draggable, ...galvRows] };
        })
      };
    }));
    setFabDropTarget(null);
    fabDragRef.current = { sourceFabId: null, sourceItemId: null, sourceMaterialId: null };
  };

  const handleFabDragEnd = () => {
    setFabDropTarget(null);
    fabDragRef.current = { sourceFabId: null, sourceItemId: null, sourceMaterialId: null };
  };

  // Material-level Fabrication functions
  const addMaterialFab = async (itemId, materialId) => {
    // Snapshot current state before async work
    const currentItem = items.find(i => i.id === itemId);
    const material = currentItem?.materials.find(m => m.id === materialId);
    const isChild = !!material?.parentMaterialId;
    const defaultOp = isChild ? 'Welding- Fillet' : 'Cut- Straight';

    // Fetch pricing for the default op (covers drilling/prep/welding global rates too)
    const pricing = material?.size ? await getPricingForSize(material.size) : null;
    const rate = pricing?.[OP_PRICING_FIELD[defaultOp]] ?? 0;

    setItems(prevItems => prevItems.map(item => {
      if (item.id !== itemId) return item;
      const mat = item.materials.find(m => m.id === materialId);
      if (!mat) return item;
      const parent = mat.parentMaterialId
        ? item.materials.find(m => m.id === mat.parentMaterialId)
        : null;

      const newFab = isChild ? {
        id: Date.now(),
        applyTo: parent ? parent.id : 'self',
        operation: defaultOp,
        quantity: 1,
        length: null,
        unit: OP_DEFAULT_UNIT[defaultOp] ?? 'IN',
        unitPrice: rate,
        totalCost: rate, // qty=1 × rate
      } : {
        id: Date.now(),
        applyTo: null,
        operation: defaultOp,
        quantity: 1,
        length: null,
        unit: 'EA',
        unitPrice: rate,
        totalCost: rate, // qty=1 × rate
        connWeight: null,
      };

      return {
        ...item,
        materials: item.materials.map(m =>
          m.id === materialId ? { ...m, fabrication: [...(m.fabrication || []), newFab] } : m
        ),
      };
    }));
  };

  const updateMaterialFab = async (itemId, materialId, fabId, field, value) => {
    // Pre-fetch pricing before entering setItems when the operation is changing
    let pricing = null;
    if (field === 'operation') {
      const currentItem = items.find(i => i.id === itemId);
      const currentMat = currentItem?.materials.find(m => m.id === materialId);
      if (currentMat?.size) pricing = await getPricingForSize(currentMat.size);
    }

    setItems(prevItems => prevItems.map(item => {
      if (item.id !== itemId) return item;

      const updatedMaterials = item.materials.map(mat => {
        if (mat.id !== materialId) return mat;

        const updatedFab = (mat.fabrication || []).map(fab => {
          if (fab.id !== fabId) return fab;

          const updated = { ...fab, [field]: value };

          // Handle operation change — apply DB pricing for the new operation
          if (field === 'operation') {
            const newOp = value;
            const isConnOp = CONNECTION_WEIGHT_OPS.has(newOp);
            const pricingField = OP_PRICING_FIELD[newOp];
            const rate = pricingField
              ? (pricing?.[pricingField] ?? 0)
              : (customOpRateMap[newOp]?.rate ?? 0);
            const weightField = OP_WEIGHT_FIELD[newOp];
            const connWeight = (pricing && weightField)
              ? (pricing[weightField] ?? getConnectionWeight(mat.size, mat.category))
              : (isConnOp ? getConnectionWeight(mat.size, mat.category) : null);

            updated.unitPrice = rate;
            updated.length = null;

            if (isConnOp) {
              updated.connWeight = connWeight;
              updated.quantity = 1;
              updated.unit = 'EA';
              updated.galvanized = false;
              updated.galvWeight = null;
            } else {
              updated.connWeight = null;
              updated.galvanized = false;
              updated.galvWeight = null;
              updated.unit = OP_DEFAULT_UNIT[newOp] ?? customOpRateMap[newOp]?.unit ?? 'EA';
            }
          }
          
          // Calculate galv weight for connections when galvanized or qty/connWeight changes
          if (updated.connWeight && CONNECTION_WEIGHT_OPS.has(updated.operation)) {
            if (updated.galvanized) {
              updated.galvWeight = (updated.quantity || 0) * updated.connWeight;
            } else {
              updated.galvWeight = null;
            }
          }
          
          // Calculate total (engine rules: connections by LB/EA, length-based, standard)
          updated.totalCost = computeFabLineTotal(updated);

          return updated;
        });
        
        // Handle galvanizing for connections - add/remove galv line item
        let finalFab = [...updatedFab];
        const changedFab = updatedFab.find(f => f.id === fabId);
        
        if (changedFab && CONNECTION_WEIGHT_OPS.has(changedFab.operation)) {
          const galvLineId = `galv-${fabId}`; // Linked galv line ID
          const galvLineIndex = finalFab.findIndex(f => f.id === galvLineId);
          
          if (field === 'galvanized') {
            if (value === true && changedFab.galvWeight > 0) {
              // Add galv line for this connection
              if (galvLineIndex === -1) {
                finalFab.push({
                  id: galvLineId,
                  operation: 'Galvanizing',
                  description: `Galv - ${changedFab.operation}`,
                  quantity: changedFab.galvWeight,
                  unit: 'LB',
                  unitPrice: 0,
                  totalCost: 0,
                  isConnGalv: true,
                  parentFabId: fabId
                });
              }
            } else {
              // Remove galv line for this connection
              if (galvLineIndex !== -1) {
                finalFab.splice(galvLineIndex, 1);
              }
            }
          } else if (['quantity', 'connWeight'].includes(field) && changedFab.galvanized) {
            // Update existing galv line weight
            if (galvLineIndex !== -1) {
              finalFab[galvLineIndex] = {
                ...finalFab[galvLineIndex],
                quantity: changedFab.galvWeight,
                totalCost: (changedFab.galvWeight || 0) * (finalFab[galvLineIndex].unitPrice || 0)
              };
            }
          }
        }
        
        return { ...mat, fabrication: finalFab };
      });
      
      return { ...item, materials: updatedMaterials };
    }));
  };

  const deleteMaterialFab = (itemId, materialId, fabId) => {
    setItems(items.map(item => {
      if (item.id !== itemId) return item;
      
      const updatedMaterials = item.materials.map(mat => {
        if (mat.id !== materialId) return mat;
        // Filter out the target fab AND any linked galv lines (parentFabId or galv-{fabId} pattern)
        return { ...mat, fabrication: (mat.fabrication || []).filter(f => 
          f.id !== fabId && f.parentFabId !== fabId && f.id !== `galv-${fabId}`
        ) };
      });
      
      return { ...item, materials: updatedMaterials };
    }));
  };

  // Item-level Fabrication functions (for general ops like Handling, Prime Paint)
  const addFabrication = (itemId) => {
    const newFab = {
      id: Date.now(),
      operation: 'Handling',
      description: '',
      quantity: 1,
      unit: 'EA',
      unitPrice: 0,
      totalCost: 0
    };
    setItems(items.map(item =>
      item.id === itemId ? { ...item, fabrication: [...item.fabrication, newFab] } : item
    ));
  };

  const updateFabrication = (itemId, fabId, field, value) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const updatedFab = item.fabrication.map(fab => {
          if (fab.id === fabId) {
            const updated = { ...fab, [field]: value };
            updated.totalCost = (updated.quantity || 0) * (updated.unitPrice || 0);
            return updated;
          }
          return fab;
        });
        return { ...item, fabrication: updatedFab };
      }
      return item;
    }));
  };

  const deleteFabrication = (itemId, fabId) => {
    setItems(items.map(item =>
      item.id === itemId ? { ...item, fabrication: item.fabrication.filter(f => f.id !== fabId) } : item
    ));
  };

  // ── SNAPSHOT HELPERS ────────────────────────────────────────────────────────
  const compressImage = (file) => new Promise((resolve) => {
    const MAX_W = 1400;
    const QUALITY = 0.75;
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, MAX_W / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.src = URL.createObjectURL(file);
  });

  const addSnapshot = async (itemId, file) => {
    const imageData = await compressImage(file);
    const snap = { id: Date.now() + Math.random(), imageData, caption: '', sortOrder: 0 };
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, snapshots: [...(item.snapshots || []), snap] }
        : item
    ));
  };

  const removeSnapshot = (itemId, snapId) => {
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, snapshots: (item.snapshots || []).filter(s => s.id !== snapId) }
        : item
    ));
  };

  const updateSnapshotCaption = (itemId, snapId, caption) => {
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, snapshots: (item.snapshots || []).map(s => s.id === snapId ? { ...s, caption } : s) }
        : item
    ));
  };

  const handleSnapshotPaste = async (itemId, e) => {
    const items2 = e.clipboardData?.items;
    if (!items2) return;
    for (const clipItem of items2) {
      if (clipItem.type.startsWith('image/')) {
        e.preventDefault();
        await addSnapshot(itemId, clipItem.getAsFile());
        break;
      }
    }
  };

  // Recap cost functions
  const updateRecapCost = (itemId, costType, field, value) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const updatedCosts = { ...item.recapCosts };
        if (costType === 'projectManagement') {
          // PM uses hours * rate
          updatedCosts.projectManagement = { ...updatedCosts.projectManagement, [field]: parseFloat(value) || 0 };
          updatedCosts.projectManagement.total = updatedCosts.projectManagement.hours * updatedCosts.projectManagement.rate;
        } else {
          // Installation, Drafting, Engineering, Shipping, Custom use cost + markup %
          updatedCosts[costType] = { ...updatedCosts[costType], [field]: parseFloat(value) || 0 };
          const baseCost = updatedCosts[costType].cost || 0;
          const markupPct = updatedCosts[costType].markup || 0;
          updatedCosts[costType].total = baseCost + (baseCost * markupPct / 100);
        }
        return { ...item, recapCosts: updatedCosts };
      }
      return item;
    }));
  };

  // Custom Recap Column functions
  const addCustomRecapColumn = (name) => {
    if (!name || name.trim() === '') return;
    const colKey = `custom_${Date.now()}`;
    const colName = name.trim();
    
    // Add to custom columns list
    setCustomRecapColumns([...customRecapColumns, { key: colKey, name: colName }]);
    
    // Add to all items' recapCosts
    setItems(items.map(item => ({
      ...item,
      recapCosts: {
        ...item.recapCosts,
        [colKey]: { cost: 0, markup: 0, total: 0 }
      }
    })));
  };

  const removeCustomRecapColumn = (colKey) => {
    // Remove from custom columns list
    setCustomRecapColumns(customRecapColumns.filter(c => c.key !== colKey));
    
    // Remove from all items' recapCosts
    setItems(items.map(item => {
      const updatedCosts = { ...item.recapCosts };
      delete updatedCosts[colKey];
      return { ...item, recapCosts: updatedCosts };
    }));
  };

  const renameCustomRecapColumn = (colKey, newName) => {
    setCustomRecapColumns(customRecapColumns.map(c => 
      c.key === colKey ? { ...c, name: newName } : c
    ));
  };

  // ── CROSS-ITEM NESTING ──────────────────────────────────────────────────────
  // Pool cuts from all non-standalone items and nest them onto shared sticks.
  // The nest (and the write-back effect it feeds) keys off a DEFERRED copy of
  // items, so keystrokes paint immediately and the re-nest runs at idle
  // priority instead of blocking every character typed.
  const deferredItems = useDeferredValue(items);
  const projectNest = useMemo(() => {
    if (!nestingEnabled) return null;
    const kerfFt = (parseFloat(nestKerfIn) || 0) / 12;
    const endCropFt = (parseFloat(nestEndCropIn) || 0) / 12;
    return computeProjectNest(deferredItems, kerfFt, endCropFt, availableLengthsFor, lengthCapsFor);
  }, [deferredItems, nestingEnabled, nestKerfIn, nestEndCropIn, stockLengthOverrides]);

  // Write pooled allocations back onto material lines so every consumer of
  // stockWeight / totalCost (totals, tax, save payload, exports) sees pooled
  // numbers without changes. Every line is re-derived (so supplier length
  // overrides also revalidate standalone lines), but a value-equality guard
  // preserves object references — the items → projectNest → effect cycle
  // settles after one pass.
  useEffect(() => {
    const NUMERIC_GUARD_KEYS = [
      'stockLength', 'optimalStockLength', 'stocksRequired', 'stockWeight',
      'piecesPerStock', 'wasteLength', 'efficiency', 'totalCost',
      'fabWeight', 'totalLength', 'weightPerFoot', 'nestYield', 'standaloneStockWeight',
    ];
    const sameCalc = (a, b) => {
      if (!!a.pooled !== !!b.pooled || !!a.overLength !== !!b.overLength ||
          !!a.shortfall !== !!b.shortfall ||
          !!a.isManualOverride !== !!b.isManualOverride) return false;
      return NUMERIC_GUARD_KEYS.every(k => {
        const av = a[k], bv = b[k];
        if (typeof av === 'number' || typeof bv === 'number') {
          return Math.abs((av || 0) - (bv || 0)) < 0.005;
        }
        return (av ?? null) === (bv ?? null);
      });
    };
    setItems(prev => {
      let anyChanged = false;
      const next = prev.map(item => {
        let itemChanged = false;
        const materials = item.materials.map(mat => {
          // Rebuild standalone numbers from scratch (honoring current supplier
          // lengths), then overlay the pooled share if this line is in the nest.
          const { pooled, nestYield, overLength, shortfall, standaloneStockWeight, ...rest } = mat;
          const base = calculateMaterial(rest);
          const alloc = projectNest && !item.priceStandalone ? projectNest.byMaterial.get(mat.id) : null;
          let candidate;
          if (alloc) {
            const { stockWeight, totalCost } = pooledLineCost(base, alloc);
            candidate = {
              ...base,
              pooled: true,
              nestYield: alloc.yield,
              overLength: alloc.overLength,
              shortfall: alloc.shortfall,
              standaloneStockWeight: base.stockWeight,
              stockWeight,
              totalCost,
            };
          } else {
            candidate = base;
          }
          if (sameCalc(mat, candidate)) return mat;
          itemChanged = true;
          return candidate;
        });
        if (!itemChanged) return item;
        anyChanged = true;
        return { ...item, materials };
      });
      return anyChanged ? next : prev;
    });
  }, [projectNest, stockLengthOverrides]);

  // Calculate totals
  const calculateTotals = () => projectTotals(items, adjustments, taxCategory, DEFAULT_PRICING_RATES).totals;

  const totals = useMemo(() => calculateTotals(), [items, adjustments, taxCategory]);

  // Get stock list. Pooled materials are covered by the nest's purchase
  // summary; everything else (plates, custom, standalone items, nesting off)
  // contributes its per-line stocks as before.
  const getStockList = () => {
    const stockSummary = {};
    const addStocks = (size, stockLength, weightPerFoot, count) => {
      const key = `${size}-${stockLength}`;
      if (!stockSummary[key]) {
        stockSummary[key] = { size, stockLength, weightPerFoot: weightPerFoot || 0, totalStocks: 0, totalWeight: 0 };
      }
      stockSummary[key].totalStocks += count;
      stockSummary[key].totalWeight += count * stockLength * (weightPerFoot || 0);
    };
    items.forEach(item => {
      item.materials.forEach(mat => {
        if (projectNest && mat.pooled) return; // covered by the nest below
        if (mat.size && mat.stocksRequired > 0) {
          addStocks(mat.size, mat.stockLength, mat.weightPerFoot, mat.stocksRequired);
        }
      });
    });
    if (projectNest) {
      projectNest.groups.forEach(g => {
        g.purchase.forEach(p => addStocks(g.size, p.stockLength, g.weightPerFoot, p.count));
      });
    }
    return Object.values(stockSummary).sort((a, b) => a.size.localeCompare(b.size));
  };

  // Memoized stock list to avoid recalculating on every render
  const stockList = useMemo(() => getStockList(), [items, projectNest]);

  // Per-item stock breakdown (one row per item + size + stockLength) for the buy list display
  const getDetailedStockList = () => {
    const result = [];
    items.forEach(item => {
      const perItem = {};
      item.materials.forEach(mat => {
        if (projectNest && mat.pooled) return; // shown as pooled rows below
        if (mat.size && mat.stocksRequired > 0) {
          const key = `${mat.size}-${mat.stockLength}`;
          if (!perItem[key]) {
            perItem[key] = {
              itemNumber: item.itemNumber,
              itemName: item.itemName,
              size: mat.size,
              stockLength: mat.stockLength,
              weightPerFoot: mat.weightPerFoot || 0,
              totalStocks: 0,
              totalWeight: 0,
            };
          }
          perItem[key].totalStocks += mat.stocksRequired;
          perItem[key].totalWeight += mat.stocksRequired * mat.stockLength * (mat.weightPerFoot || 0);
        }
      });
      result.push(...Object.values(perItem));
    });
    if (projectNest) {
      projectNest.groups.forEach(g => {
        const itemNumbers = [...new Set(g.sticks.flatMap(st => st.cuts.map(c => c.itemNumber)))]
          .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        g.purchase.forEach(p => {
          result.push({
            itemNumber: 'Pooled',
            itemName: `Items ${itemNumbers.join(', ')}`,
            size: g.size,
            stockLength: p.stockLength,
            weightPerFoot: g.weightPerFoot,
            totalStocks: p.count,
            totalWeight: p.count * p.stockLength * (g.weightPerFoot || 0),
            pooled: true,
          });
        });
      });
    }
    return result;
  };

  const detailedStockList = useMemo(() => getDetailedStockList(), [items, projectNest]);

  // Distinct sizes on the estimate, for the supplier-availability editor and
  // size-group pricing.
  const sizesInUse = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      item.materials.forEach(mat => {
        if (mat.size && !map.has(mat.size)) map.set(mat.size, { size: mat.size, category: mat.category });
      });
    });
    return [...map.values()].sort((a, b) => a.size.localeCompare(b.size));
  }, [items]);

  // Current per-size pricing derived from material lines: one entry per size,
  // flagged mixed when lines disagree.
  const sizePricing = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      item.materials.forEach(mat => {
        if (!mat.size) return;
        const cur = map.get(mat.size);
        if (!cur) {
          map.set(mat.size, { priceBy: mat.priceBy || 'LB', unitPrice: mat.unitPrice || 0, mixed: false });
        } else if (cur.priceBy !== (mat.priceBy || 'LB') || Math.abs(cur.unitPrice - (mat.unitPrice || 0)) > 1e-9) {
          cur.mixed = true;
        }
      });
    });
    return map;
  }, [items]);

  // Round every material length in the estimate to the nearest 1" (estimating
  // tolerance). Recalculates weights/costs and keeps auto-galv quantities in
  // sync. Imports already round on the way in; this covers manual entries and
  // estimates imported before rounding existed.
  const roundAllLengthsToInch = () => {
    let changed = 0;
    items.forEach(item => item.materials.forEach(mat => {
      const len = parseFloat(mat.length) || 0;
      if (len > 0 && Math.abs(roundLengthToInch(len) - len) > 1e-9) changed++;
    }));
    if (changed === 0) {
      alert('All material lengths are already on even inches.');
      return;
    }
    if (!confirm(`Round ${changed} material length${changed === 1 ? '' : 's'} to the nearest 1"?\n\nWeights and costs recalculate to match. Lengths entered to finer precision will be changed.`)) return;
    setItems(prev => prev.map(item => ({
      ...item,
      materials: item.materials.map(mat => {
        const len = parseFloat(mat.length) || 0;
        if (len <= 0) return mat;
        const rounded = roundLengthToInch(len);
        if (Math.abs(rounded - len) < 1e-9) return mat;
        const updated = calculateMaterial({ ...mat, length: rounded });
        if (updated.galvanized) {
          updated.fabrication = (updated.fabrication || []).map(f => f.isAutoGalv
            ? {
                ...f,
                quantity: updated.fabWeight || 0,
                description: `Galv - ${updated.description || updated.size}`,
                totalCost: (updated.fabWeight || 0) * (f.unitPrice || 0),
              }
            : f);
        }
        return updated;
      }),
    })));
  };

  // Apply a supplier rate to every material line of a size, project-wide.
  // The nest write-back effect then re-derives pooled totals.
  const applySizePrice = (size, priceBy, unitPrice) => {
    setItems(prev => prev.map(item => ({
      ...item,
      materials: item.materials.map(mat =>
        mat.size === size ? calculateMaterial({ ...mat, priceBy, unitPrice }) : mat),
    })));
  };

  // Zero-weight guard: a material with pieces but no weight per foot is almost
  // always an unmatched import size or a Custom line missing its weight — it
  // contributes $0 and 0 lbs, which is easy to miss in a long estimate.
  const isZeroWeight = (m) => (m.weightPerFoot || 0) === 0 && (m.pieces || 0) > 0;
  const zeroWeightCount = useMemo(
    () => items.reduce((n, item) => n + item.materials.filter(isZeroWeight).length, 0),
    [items]
  );

  // Filter + sort applied to the detailed list for the buy list display
  const displayedStockList = useMemo(() => {
    const q = stockListFilter.trim().toLowerCase();
    const filtered = q ? detailedStockList.filter(s => s.size.toLowerCase().includes(q)) : detailedStockList;
    const { field, dir } = stockListSort;
    const mul = dir === 'asc' ? 1 : -1;
    const cmp = {
      itemNumber: (a, b) => a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric: true }),
      size:       (a, b) => a.size.localeCompare(b.size),
      stockLength:(a, b) => a.stockLength - b.stockLength,
      totalStocks:(a, b) => a.totalStocks - b.totalStocks,
      totalWeight:(a, b) => a.totalWeight - b.totalWeight,
    }[field] || ((a, b) => 0);
    return [...filtered].sort((a, b) => mul * cmp(a, b));
  }, [detailedStockList, stockListSort, stockListFilter]);

  const toggleStockSort = (field) => {
    setStockListSort(prev => prev.field === field
      ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' });
  };

  const sortArrow = (field) => stockListSort.field === field ? (stockListSort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div className="max-w-7xl mx-auto p-4 bg-gray-100 dark:bg-gray-700 min-h-screen">
      <div className="bg-white dark:bg-gray-900 rounded shadow">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-600">
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (isDirty) await saveRef.current?.();
                window.location.href = '/dashboard';
              }}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-800"
              title="Back to Projects"
              data-testid="button-back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Steel Estimator</h1>
            </div>
            <span className={`ml-2 px-2.5 py-1 rounded border text-xs font-semibold ${STATUS_COLORS[projectStatus] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`} data-testid="text-project-status">
              {STATUS_LABELS[projectStatus] || projectStatus}
            </span>
            {isReadOnly && <span className="text-xs text-amber-600 font-medium">(Read Only)</span>}
          </div>
          <div className="flex gap-2 items-center flex-wrap justify-end">
            {sessionExpired && (
              <span className="text-red-600 text-sm flex items-center gap-2" data-testid="session-expired-banner">
                <AlertCircle size={14} />
                Session expired — changes kept on this computer
                <a
                  href="/login?callbackUrl=%2F"
                  target="_blank"
                  rel="noopener"
                  className="underline font-medium"
                >
                  Log back in
                </a>
                <button
                  onClick={() => {
                    // Write the ref directly: saveRef fires before React runs
                    // the effect that syncs it, and a stale true would send the
                    // retry back into the stash-only path.
                    sessionExpiredRef.current = false;
                    setSessionExpired(false);
                    saveRef.current?.();
                  }}
                  className="px-2 py-0.5 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
                  data-testid="button-retry-save"
                >
                  Retry save
                </button>
              </span>
            )}
            {isDirty && !sessionExpired && saveStatus !== 'saving' && saveStatus !== 'saved' && (
              <span className="text-amber-500 text-sm flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                Unsaved
              </span>
            )}
            {saveStatus === 'saved' && <span className="text-green-600 text-sm flex items-center gap-1"><Check size={14} /> Saved</span>}
            {saveStatus === 'error' && <span className="text-red-600 text-sm">Save failed</span>}
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1 bg-gray-700 dark:bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
                data-testid="button-save"
              >
                <Save size={16} /> {saveStatus === 'saving' ? 'Saving...' : 'Save'}
              </button>
            )}
            <div className="relative" ref={exportMenuRef}>
              <button onClick={() => setShowExportMenu(p => !p)} disabled={pdfExporting}
                className="flex items-center gap-1 bg-gray-700 dark:bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50">
                {pdfExporting
                  ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Generating…</>
                  : <><Download size={16} /> Export <ChevronDown size={14} /></>}
              </button>
              {showExportMenu && !pdfExporting && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-50 min-w-48">
                  <button onClick={handleExportErectorScope}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    <FileText size={14} /> Erector Scope (No Pricing)
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700" />
                  <button onClick={handleExportJobFolder}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    <Download size={14} /> Job Folder (Full)
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700" />
                  <button onClick={handleExportStockListPdf}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    <FileText size={14} /> Stock Buy List (Priced)
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700" />
                  <button onClick={handleExportCutDetailPdf}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    <FileText size={14} /> Cut Detail (Nest Record)
                  </button>
                </div>
              )}
            </div>
            {/* Status transition buttons */}
            {projectStatus === 'DRAFT' && (userRole === 'ADMIN' || userRole === 'ESTIMATOR') && (
              <button onClick={() => handleStatusChange('IN_REVIEW')} disabled={statusChanging}
                className="px-3 py-2 bg-amber-500 dark:bg-amber-600 text-white rounded text-sm hover:bg-amber-600 dark:hover:bg-amber-500 disabled:opacity-50" data-testid="button-submit-review">
                Submit for Review
              </button>
            )}
            {projectStatus === 'IN_REVIEW' && userRole === 'ADMIN' && (
              <button onClick={() => handleStatusChange('PUBLISHED')} disabled={statusChanging}
                className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50" data-testid="button-publish">
                Publish
              </button>
            )}
            {projectStatus === 'IN_REVIEW' && (userRole === 'ESTIMATOR' || userRole === 'ADMIN') && (
              <button onClick={() => handleStatusChange('DRAFT')} disabled={statusChanging}
                className="px-3 py-2 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50" data-testid="button-recall">
                Recall Submission
              </button>
            )}
            {projectStatus === 'PUBLISHED' && userRole === 'ADMIN' && (
              <button onClick={() => handleStatusChange('REOPENED')} disabled={statusChanging}
                className="px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50" data-testid="button-reopen">
                Reopen for Editing
              </button>
            )}
            {projectStatus === 'REOPENED' && userRole === 'ADMIN' && (
              <button onClick={() => handleStatusChange('PUBLISHED')} disabled={statusChanging}
                className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50" data-testid="button-republish">
                Re-Publish
              </button>
            )}
            {userRole === 'ADMIN' && projectStatus !== 'DRAFT' && projectStatus !== 'IN_REVIEW' && (
              <button onClick={() => handleStatusChange('DRAFT')} disabled={statusChanging}
                className="px-3 py-2 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50" data-testid="button-reset-draft">
                Reset to Draft
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-300 dark:border-gray-600 overflow-x-auto">
          {['project', 'estimate', 'stocklist', 'recap', 'summary', 'quote'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium whitespace-nowrap ${activeTab === tab ? 'bg-gray-700 dark:bg-gray-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              {tab === 'project' ? 'Project Info' : tab === 'estimate' ? 'Estimate' : tab === 'recap' ? 'Recap' : tab === 'stocklist' ? 'Stock List' : tab === 'summary' ? 'Summary' : 'Quote'}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* PROJECT TAB */}
          {activeTab === 'project' && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Customer Information</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name</label>
                    <CustomerSearchInput
                      value={customerName}
                      customerId={customerId}
                      onChange={(name, id) => { setCustomerName(name); setCustomerId(id); }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Billing Address</label>
                    <input type="text" value={billingAddress} onChange={e => setBillingAddress(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Name</label>
                    <input type="text" value={customerContact} onChange={e => setCustomerContact(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                    <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                    <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                </div>
              </div>

              {/* Project Details */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Project Details</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name</label>
                    <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Project Address</label>
                    <input type="text" value={projectAddress} onChange={e => setProjectAddress(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Drawing Date</label>
                    <input type="date" value={drawingDate} onChange={e => setDrawingDate(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Drawing Revision</label>
                    <input type="text" value={drawingRevision} onChange={e => setDrawingRevision(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Architect</label>
                    <input type="text" value={architect} onChange={e => setArchitect(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bid Date</label>
                    <input type="date" value={estimateDate} onChange={e => setEstimateDate(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Time Due</label>
                    <select value={bidTime} onChange={e => setBidTime(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                      <option value="">— No Time —</option>
                      {['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'].map(t => {
                        const [h] = t.split(':').map(Number);
                        const label = h === 12 ? '12:00 PM' : h > 12 ? `${h-12}:00 PM` : `${h}:00 AM`;
                        return <option key={t} value={t}>{label}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated By</label>
                    <input type="text" value={estimatedBy} onChange={e => setEstimatedBy(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                </div>
              </div>

              {/* Bid & Dashboard */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Bid &amp; Dashboard</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Estimator</label>
                    <select
                      value={estimatorId || ''}
                      onChange={e => setEstimatorId(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                    >
                      <option value="">— Unassigned —</option>
                      {usersList.map(u => (
                        <option key={u.id} value={u.id}>
                          {[u.firstName, u.lastName].filter(Boolean).join(' ') || `User ${u.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">New / C.O.</label>
                    <select
                      value={newOrCo}
                      onChange={e => setNewOrCo(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                    >
                      <option value="">— None —</option>
                      <option value="NEW_PROJECT">New Project</option>
                      <option value="CHANGE_ORDER">Change Order</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      className="w-full p-2 border rounded text-sm resize-y dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      placeholder="Internal notes about this bid..."
                    />
                  </div>
                </div>
              </div>

              {/* Project Type */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Project Type</h2>
                <div className="flex flex-wrap gap-6 mb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={projectTypes.structural}
                      onChange={() => toggleProjectType('structural')}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium">Structural</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={projectTypes.miscellaneous}
                      onChange={() => toggleProjectType('miscellaneous')}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium">Miscellaneous</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={projectTypes.ornamental}
                      onChange={() => toggleProjectType('ornamental')}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium">Ornamental</span>
                  </label>
                  {customProjectTypes.map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked
                        onChange={() => removeCustomProjectType(t)}
                        className="w-4 h-4 rounded" />
                      <span className="text-sm font-medium">{t}</span>
                    </label>
                  ))}
                </div>
                <div className="border-t pt-3 mt-3">
                  <p className="text-sm font-medium mb-2">Custom Types:</p>
                  <div className="flex gap-2">
                    <input type="text" value={newCustomProjectType} onChange={e => setNewCustomProjectType(e.target.value)}
                      placeholder="Add custom type" className="flex-1 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      onKeyDown={e => e.key === 'Enter' && addCustomProjectType()} />
                    <button onClick={addCustomProjectType} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Add</button>
                  </div>
                </div>
              </div>

              {/* Delivery Options */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Delivery Options</h2>
                <div className="flex flex-wrap gap-6 mb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="deliveryOption" checked={deliveryOptions.installed}
                      onChange={() => toggleDeliveryOption('installed')}
                      className="w-4 h-4" />
                    <span className="text-sm font-medium">Installed</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="deliveryOption" checked={deliveryOptions.fobJobsite}
                      onChange={() => toggleDeliveryOption('fobJobsite')}
                      className="w-4 h-4" />
                    <span className="text-sm font-medium">F.O.B. Jobsite</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="deliveryOption" checked={deliveryOptions.willCall}
                      onChange={() => toggleDeliveryOption('willCall')}
                      className="w-4 h-4" />
                    <span className="text-sm font-medium">Will Call</span>
                  </label>
                  {customDeliveryOptions.map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="deliveryOption" checked={selectedCustomDelivery === opt}
                        onChange={() => selectCustomDelivery(opt)}
                        className="w-4 h-4" />
                      <span className="text-sm font-medium">{opt}</span>
                    </label>
                  ))}
                </div>
                <div className="border-t pt-3 mt-3">
                  <p className="text-sm font-medium mb-2">Custom Options:</p>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={newCustomDeliveryOption} onChange={e => setNewCustomDeliveryOption(e.target.value)}
                      placeholder="Add custom option" className="flex-1 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      onKeyDown={e => e.key === 'Enter' && addCustomDeliveryOption()} />
                    <button onClick={addCustomDeliveryOption} className="bg-purple-600 text-white px-3 py-1 rounded text-sm">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customDeliveryOptions.map(opt => (
                      <span key={opt} className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded text-sm flex items-center gap-1">
                        {opt}
                        <button onClick={() => removeCustomDeliveryOption(opt)} className="text-purple-600 dark:text-purple-300 hover:text-purple-800"><X size={14} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tax Category */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Tax Category</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(taxCategoryDescriptions).map(([key, info]) => {
                    const isSelected = taxCategory === key;
                    const colorMap = {
                      blue: isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400',
                      green: isSelected ? 'bg-green-600 text-white border-green-600' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-green-400',
                      amber: isSelected ? 'bg-amber-600 text-white border-amber-600' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-amber-400',
                      gray: isSelected ? 'bg-gray-600 text-white border-gray-600' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    };
                    return (
                      <button
                        key={key}
                        onClick={() => setTaxCategory(taxCategory === key ? null : key)}
                        className={`p-3 rounded border-2 text-left transition-all ${colorMap[info.color]}`}
                      >
                        <div className="font-semibold text-sm">{info.label}</div>
                        <div className={`text-xs mt-1 ${isSelected ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{info.description}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Local rate: {(TAX_RATE * 100).toFixed(2)}% — Select a category to auto-generate the tax column on the Recap tab.</p>
                  {taxCategory && (
                    <span className="text-xs font-medium px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                      Active: {taxCategoryDescriptions[taxCategory].label}
                    </span>
                  )}
                </div>
              </div>

              {/* Material Nesting */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Material Nesting</h2>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={nestingEnabled}
                    onChange={e => setNestingEnabled(e.target.checked)}
                    className="w-4 h-4 rounded" />
                  <span className="text-sm font-medium">Nest stock across items</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Pools cut lengths from all items by size and nests them onto shared sticks, so one item's drop
                  absorbs another item's short piece. Each item is charged its pro-rata share of the purchased
                  steel, so per-item pricing still sums exactly to the buy list. Items flagged
                  "Price standalone" on the Estimate tab are excluded (use for alternates). Plate and Custom
                  lines always price per line.
                </p>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <span className={nestingEnabled ? '' : 'text-gray-400'}>Saw kerf per cut (in):</span>
                    <input type="number" step="0.0625" min="0" value={nestKerfIn}
                      onChange={e => setNestKerfIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      disabled={!nestingEnabled}
                      className="w-20 p-1 border rounded text-sm text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 disabled:opacity-50" />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span className={nestingEnabled ? '' : 'text-gray-400'}>End crop per stick (in):</span>
                    <input type="number" step="0.5" min="0" value={nestEndCropIn}
                      onChange={e => setNestEndCropIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      disabled={!nestingEnabled}
                      className="w-20 p-1 border rounded text-sm text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 disabled:opacity-50" />
                  </label>
                </div>
                {projectNest?.tooManyPieces && (
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400 mt-3">
                    Nesting suspended: {projectNest.tooManyPieces.toLocaleString()} total pieces exceeds the {MAX_NEST_PIECES.toLocaleString()}-piece
                    live-nesting limit — check for a quantity typo. Lines price standalone until the count drops.
                  </p>
                )}
                {projectNest && projectNest.groups.length > 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-3">
                    Nesting {projectNest.groups.length} size group{projectNest.groups.length === 1 ? '' : 's'} across items —
                    {' '}{projectNest.groups.reduce((s, g) => s + g.sticks.length, 0)} sticks,
                    {' '}{(projectNest.groups.reduce((s, g) => s + g.netLengthFt, 0) /
                          Math.max(projectNest.groups.reduce((s, g) => s + g.buyLengthFt, 0), 0.001) * 100).toFixed(1)}% overall yield.
                    See the Stock List tab for the buy list and cut detail.
                  </p>
                )}
              </div>

              {/* Exclusions */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Exclusions</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                  {standardExclusions.map(exc => (
                    <label key={exc} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={selectedExclusions.includes(exc)}
                        onChange={() => toggleExclusion(exc)} className="rounded" />
                      {exc}
                    </label>
                  ))}
                </div>
                {/* Custom exclusions */}
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-2">Custom Exclusions:</p>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={newCustomExclusion} onChange={e => setNewCustomExclusion(e.target.value)}
                      placeholder="Add custom exclusion" className="flex-1 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      onKeyDown={e => e.key === 'Enter' && addCustomExclusion()} />
                    <button onClick={addCustomExclusion} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customExclusions.map(exc => (
                      <span key={exc} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm flex items-center gap-1">
                        {exc}
                        <button onClick={() => removeCustomExclusion(exc)} className="text-blue-600 hover:text-blue-800"><X size={14} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Qualifications */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Qualifications</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                  {standardQualifications.map(qual => (
                    <label key={qual} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={selectedQualifications.includes(qual)}
                        onChange={() => toggleQualification(qual)} className="rounded" />
                      {qual}
                    </label>
                  ))}
                </div>
                {/* Custom qualifications */}
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-2">Custom Qualifications:</p>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={newCustomQualification} onChange={e => setNewCustomQualification(e.target.value)}
                      placeholder="Add custom qualification" className="flex-1 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      onKeyDown={e => e.key === 'Enter' && addCustomQualification()} />
                    <button onClick={addCustomQualification} className="bg-green-600 text-white px-3 py-1 rounded text-sm">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customQualifications.map(qual => (
                      <span key={qual} className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm flex items-center gap-1">
                        {qual}
                        <button onClick={() => removeCustomQualification(qual)} className="text-green-600 hover:text-green-800"><X size={14} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ESTIMATE TAB */}
          {activeTab === 'estimate' && (
            <div className="space-y-4">
              {/* Import/Export Controls */}
              <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-3 rounded border">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={takeoffFileInputRef}
                    onChange={handleTakeoffFileSelect}
                    accept=".csv"
                    className="hidden"
                  />
                  <button
                    onClick={() => takeoffFileInputRef.current?.click()}
                    disabled={takeoffImporting}
                    className="flex items-center gap-2 bg-blue-700 text-white px-3 py-2 rounded text-sm hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={16} />
                    {takeoffImporting ? 'Processing...' : 'Import Takeoff CSV'}
                  </button>
                  <button
                    onClick={roundAllLengthsToInch}
                    title={'Round every material length to the nearest 1" (estimating tolerance). Imports already round on the way in.'}
                    className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-3 py-2 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Round to 1″
                  </button>
                </div>
                <button onClick={addItem} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700">
                  <Plus size={16} /> Add Item
                </button>
              </div>

              {zeroWeightCount > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-300 rounded p-3 text-sm flex items-start gap-2" data-testid="banner-zero-weight">
                  <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
                  <span className="text-amber-800 dark:text-amber-300">
                    <strong>{zeroWeightCount} material line{zeroWeightCount === 1 ? '' : 's'}</strong> {zeroWeightCount === 1 ? 'has' : 'have'} quantity but zero weight
                    (highlighted below) — weight and cost are $0 until the size or custom weight is corrected.
                  </span>
                </div>
              )}

              {items.map(item => (
                <div key={item.id} className="border rounded">
                  <div className="bg-gray-200 dark:bg-gray-600 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <button onClick={() => toggleItemExpansion(item.id)} className="text-gray-600 dark:text-gray-400">
                        {expandedItems[item.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                      <input type="text" value={item.itemNumber} onChange={e => updateItem(item.id, 'itemNumber', e.target.value)}
                        className="w-16 p-1 border rounded text-sm font-mono dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                      <input type="text" value={item.itemName} onChange={e => updateItem(item.id, 'itemName', e.target.value)}
                        className="flex-1 p-1 border rounded text-sm font-semibold dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                      <div className="relative flex-shrink min-w-24" style={{ width: Math.max(96, Math.min(400, (item.drawingRef || '').length * 7.5 + 32)) }}>
                        <input type="text" value={item.drawingRef} onChange={e => updateItem(item.id, 'drawingRef', e.target.value)}
                          className="w-full p-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="Dwg Ref" title={item.drawingRef || 'Drawing Reference'} />
                      </div>
                      {nestingEnabled && (
                        <label className="flex items-center gap-1 text-xs cursor-pointer flex-shrink-0"
                          title="Exclude this item from cross-item nesting — its material prices at its own dedicated stock lengths (use for alternates or scope that may be awarded separately)">
                          <input type="checkbox" checked={!!item.priceStandalone}
                            onChange={e => updateItem(item.id, 'priceStandalone', e.target.checked)}
                            className="rounded" />
                          <span className={item.priceStandalone ? 'font-semibold text-purple-700 dark:text-purple-300' : 'text-gray-600 dark:text-gray-300'}>Standalone</span>
                        </label>
                      )}
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 ml-2"><Trash2 size={16} /></button>
                  </div>

                  {expandedItems[item.id] && (
                    <div className="p-3 space-y-4">
                      {/* Materials */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Materials</h3>
                          <div className="flex items-center gap-2">
                            <select
                              value=""
                              onChange={e => { if (e.target.value) sortItemMaterials(item.id, e.target.value); }}
                              title="Reorder this item's material lines (seq letters reassign; attachments follow their parent). One-time — you can still drag rows afterward."
                              className="p-1 border rounded text-xs text-gray-700 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-600"
                            >
                              <option value="" disabled>Sort by…</option>
                              {Object.entries(MATERIAL_SORT_PRESETS).map(([k, p]) => (
                                <option key={k} value={k}>{p.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => mergeDuplicateItemMaterials(item.id)}
                              title="Combine identical lines (same category, size, length, description, galv, pricing, and fab ops) into one, summing quantities"
                              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Merge Dups
                            </button>
                            <button onClick={() => addMaterial(item.id)} className="flex items-center gap-1 bg-blue-600 text-white px-2 py-1 rounded text-xs"><Plus size={14} /> Add Material</button>
                          </div>
                        </div>
                        {item.materials.length > 0 && (
                          <div style={{ overflowX: 'clip' }}>
                            <table className="w-full text-xs border-collapse">
                              <thead className="sticky top-0 z-10">
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                  <th className="border p-1 text-center w-12">Seq</th>
                                  <th className="border p-1 text-center">Description</th>
                                  <th className="border p-1 text-center w-28">Category</th>
                                  <th className="border p-1 text-center w-32">Size</th>
                                  <th className="border p-1 text-center w-12">Wt/ft</th>
                                  <th className="border p-1 text-center w-14">Qty</th>
                                  <th className="border p-1 text-center w-14">Length<div className="text-[9px] font-normal text-gray-500 dark:text-gray-400">(Lin/Ft)</div></th>
                                  <th className="border p-1 text-center w-16">Fab Wt</th>
                                  <th className="border p-1 text-center w-10">Galv</th>
                                  <th className="border p-1 text-center w-16" title="* indicates optimal length">Stock*</th>
                                  <th className="border p-1 text-center w-10">Stks</th>
                                  <th className="border p-1 text-center w-16">Stock Wt</th>
                                  <th className="border p-1 text-center w-14">Units</th>
                                  <th className="border p-1 text-center w-16">Rate</th>
                                  <th className="border p-1 text-center w-14">Total</th>
                                  <th className="border p-1 w-16"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Render parent materials with their children */}
                                {getParentMaterials(item.materials).map(mat => (
                                  <React.Fragment key={mat.id}>
                                    {/* Parent row */}
                                    <tr
                                      className={isZeroWeight(mat)
                                        ? 'bg-amber-50 dark:bg-amber-950 shadow-[inset_3px_0_0_0_#d97706]'
                                        : 'bg-white dark:bg-gray-900'}
                                      title={isZeroWeight(mat) ? 'Zero weight with nonzero quantity — check size / custom weight' : undefined}
                                      draggable
                                      onDragStart={e => handleDragStart(e, item.id, mat.id, true)}
                                      onDragOver={e => handleDragOver(e, item.id, mat.id, true, null)}
                                      onDragLeave={() => setDropTarget(dt => dt?.materialId === mat.id ? null : dt)}
                                      onDrop={e => handleDrop(e, item.id)}
                                      onDragEnd={handleDragEnd}
                                      style={dropTarget?.materialId === mat.id ? {
                                        boxShadow: dropTarget.position === 'before'
                                          ? 'inset 0 3px 0 0 #3b82f6'
                                          : 'inset 0 -3px 0 0 #3b82f6'
                                      } : undefined}
                                    >
                                      <td className="border p-1 font-bold text-blue-700">
                                        <div className="flex items-center gap-0.5">
                                          <GripVertical size={12} className="text-gray-400 cursor-grab flex-shrink-0" />
                                          {mat.sequence || 'A'}
                                        </div>
                                      </td>
                                      <td className="border p-1"><input type="text" value={mat.description || ''} onChange={e => updateMaterial(item.id, mat.id, 'description', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="Description" /></td>
                                      <td className="border p-1">
                                        <select value={mat.category} onChange={e => updateMaterial(item.id, mat.id, 'category', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                          <option value="Custom">Custom</option>
                                        </select>
                                      </td>
                                      <td className="border p-1">
                                        {mat.category === 'Custom' ? (
                                          <input type="text" value={mat.size || ''} onChange={e => updateMaterial(item.id, mat.id, 'size', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                                        ) : mat.category === 'Plate' ? (
                                          <div className="flex items-center gap-1">
                                            <select 
                                              value={mat.plateThickness || ''} 
                                              onChange={e => updateMaterial(item.id, mat.id, 'plateThickness', e.target.value)} 
                                              className="flex-1 p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                                            >
                                              <option value="">Thick</option>
                                              {plateThicknesses.map(t => <option key={t.label} value={t.value}>{t.label}</option>)}
                                            </select>
                                            <span className="text-gray-500 dark:text-gray-400">×</span>
                                            <input 
                                              type="number" 
                                              step="0.5" 
                                              value={mat.plateWidth || ''} 
                                              onChange={e => updateMaterial(item.id, mat.id, 'plateWidth', parseFloat(e.target.value) || 0)} 
                                              className="w-12 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="W"
                                            />
                                            <span className="text-gray-500 dark:text-gray-400 text-xs">"</span>
                                          </div>
                                        ) : (
                                          <select value={mat.size} onChange={e => updateMaterial(item.id, mat.id, 'size', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                            {getShapesForCategory(mat.category).map(s => <option key={s} value={s}>{s}</option>)}
                                          </select>
                                        )}
                                      </td>
                                      <td className="border p-1">
                                        {mat.category === 'Custom' ? (
                                          <input type="number" step="0.01" value={mat.customWeight || ''} onChange={e => updateMaterial(item.id, mat.id, 'customWeight', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                                        ) : mat.category === 'Plate' ? (
                                          <span className="block text-right">{mat.weightPerFoot?.toFixed(2) || '—'}</span>
                                        ) : (
                                          <span className="block text-right">{mat.weightPerFoot?.toFixed(2)}</span>
                                        )}
                                      </td>
                                      <td className="border p-1">
                                        <div className="flex items-center justify-center gap-0.5">
                                          <button 
                                            onClick={() => updateMaterial(item.id, mat.id, 'pieces', Math.max(1, (mat.pieces || 1) - 1))}
                                            className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded text-xs font-bold"
                                          >−</button>
                                          <input 
                                            type="number" 
                                            value={mat.pieces || ''} 
                                            onChange={e => updateMaterial(item.id, mat.id, 'pieces', parseInt(e.target.value) || 0)} 
                                            className="w-10 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                                          />
                                          <button 
                                            onClick={() => updateMaterial(item.id, mat.id, 'pieces', (mat.pieces || 0) + 1)}
                                            className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded text-xs font-bold"
                                          >+</button>
                                        </div>
                                      </td>
                                      <td className="border p-1"><input type="number" step="0.01" value={mat.length || ''} onChange={e => updateMaterial(item.id, mat.id, 'length', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="0.00" /></td>
                                      <td className="border p-1 text-right bg-blue-50 dark:bg-blue-950">{fmtWt(mat.fabWeight || 0)}</td>
                                      <td className="border p-1 text-center">
                                        <input type="checkbox" checked={mat.galvanized || false} 
                                          onChange={e => updateMaterial(item.id, mat.id, 'galvanized', e.target.checked)} 
                                          className="w-4 h-4 rounded" title="Add Galvanizing" />
                                      </td>
                                      <td className="border p-1">
                                        {mat.pooled ? (
                                          <div
                                            className={`text-center text-xs font-semibold rounded px-1 py-0.5 ${mat.overLength
                                              ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                                              : mat.shortfall
                                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                                : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'}`}
                                            title={mat.overLength
                                              ? 'Piece exceeds the longest available stock — review for splice or special order'
                                              : mat.shortfall
                                                ? "Supplier stick counts can't cover all of this size's cuts — see the Stock List shortfall warning"
                                                : `Nested across items — this line carries ${((mat.nestYield - 1) * 100).toFixed(1)}% of its net weight as its share of group waste (standalone stock wt: ${fmtWt(mat.standaloneStockWeight || 0)})`}
                                          >
                                            {mat.overLength ? 'OVER LEN' : mat.shortfall ? 'SHORT SUP' : `NESTED ${(100 / (mat.nestYield || 1)).toFixed(0)}%`}
                                          </div>
                                        ) : (
                                          <>
                                            <select
                                              value={mat.stockLength}
                                              onChange={e => updateMaterial(item.id, mat.id, 'stockLength', parseFloat(e.target.value))}
                                              className={`w-full p-1 border rounded text-xs dark:border-gray-600 dark:text-gray-100 ${mat.isManualOverride ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-400' : 'dark:bg-gray-800'}`}
                                              title={mat.isManualOverride ? `Optimal: ${mat.optimalStockLength}'` : `Optimal stock length`}
                                            >
                                              {availableLengthsFor(mat.category, mat.size).map(sl => (
                                                <option key={sl} value={sl}>
                                                  {sl}'{sl === mat.optimalStockLength ? '*' : ''}
                                                </option>
                                              ))}
                                            </select>
                                            {mat.piecesPerStock > 0 && (
                                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{mat.piecesPerStock}/stk</div>
                                            )}
                                          </>
                                        )}
                                      </td>
                                      <td className="border p-1 text-right bg-gray-50 dark:bg-gray-800">{mat.pooled ? '—' : (mat.stocksRequired || 0)}</td>
                                      <td className="border p-1 text-right bg-gray-50 dark:bg-gray-800">{fmtWt(mat.stockWeight || 0)}</td>
                                      <td className="border p-1">
                                        <select value={mat.priceBy}
                                          onChange={e => mat.pooled
                                            ? applySizePrice(mat.size, e.target.value, mat.unitPrice || 0)
                                            : updateMaterial(item.id, mat.id, 'priceBy', e.target.value)}
                                          title={mat.pooled ? `Nested — applies to every ${mat.size} line` : undefined}
                                          className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                          <option value="LB">LB</option><option value="CWT">CWT</option><option value="LF">LF</option><option value="EA">EA</option>
                                        </select>
                                      </td>
                                      <td className="border p-1"><input type="number" step="0.0001" value={mat.unitPrice || ''}
                                        onChange={e => mat.pooled
                                          ? applySizePrice(mat.size, mat.priceBy || 'LB', parseFloat(e.target.value) || 0)
                                          : updateMaterial(item.id, mat.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                        title={mat.pooled ? `Nested — rate applies to every ${mat.size} line` : undefined}
                                        className="w-16 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                                      <td className="border p-1 text-right font-semibold bg-green-50 dark:bg-green-950">{fmtPrice(mat.totalCost || 0)}</td>
                                      <td className="border p-1">
                                        <div className="flex gap-1">
                                          <button onClick={() => addChildMaterial(item.id, mat.id)} className="text-blue-600 hover:text-blue-800" title="Add Attachment"><Plus size={12} /></button>
                                          <button onClick={() => addMaterialFab(item.id, mat.id)} className="text-green-600 hover:text-green-800" title="Add Fabrication"><Plus size={12} className="bg-green-100 rounded" /></button>
                                          <button onClick={() => deleteMaterial(item.id, mat.id)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 size={12} /></button>
                                        </div>
                                      </td>
                                    </tr>
                                    {/* Parent material fab rows */}
                                    {(mat.fabrication || []).filter(f => !f.isAutoGalv && !f.isConnGalv).map(fab => {
                                      const hasLength = (fab.unit === 'IN' || fab.unit === 'LF') && fab.length;
                                      const extLen = hasLength ? (fab.quantity || 0) * (fab.length || 0) : null;
                                      const isConnection = CONNECTION_WEIGHT_OPS.has(fab.operation);
                                      
                                      return (
                                      <tr
                                        key={fab.id}
                                        className="bg-green-50 dark:bg-green-950"
                                        draggable
                                        onDragStart={e => handleFabDragStart(e, item.id, mat.id, fab.id)}
                                        onDragOver={e => handleFabDragOver(e, item.id, mat.id, fab.id)}
                                        onDragLeave={() => setFabDropTarget(dt => dt?.fabId === fab.id ? null : dt)}
                                        onDrop={e => handleFabDrop(e, item.id, mat.id)}
                                        onDragEnd={handleFabDragEnd}
                                        style={fabDropTarget?.fabId === fab.id ? {
                                          boxShadow: fabDropTarget.position === 'before'
                                            ? 'inset 0 3px 0 0 #22c55e'
                                            : 'inset 0 -3px 0 0 #22c55e'
                                        } : undefined}
                                      >
                                        {/* Seq */}
                                        <td className="border p-1 text-green-600 text-center text-xs font-medium">
                                          <div className="flex items-center justify-center gap-0.5">
                                            <GripVertical size={10} className="text-green-400 cursor-grab flex-shrink-0" />
                                            <span>[Fab]</span>
                                          </div>
                                        </td>
                                        {/* Description - Operation dropdown */}
                                        <td className="border p-1">
                                          {fab.operation === 'Custom' ? (
                                            <div className="flex gap-1 items-center">
                                              <input
                                                type="text"
                                                value={fab.customOperation || ''}
                                                onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'customOperation', e.target.value)}
                                                placeholder="Custom operation..."
                                                className="flex-1 p-1 border border-orange-300 rounded text-xs bg-orange-50"
                                                autoFocus
                                              />
                                              <button onClick={() => updateMaterialFab(item.id, mat.id, fab.id, 'operation', 'Cut- Straight')} className="text-gray-400 hover:text-gray-600 text-xs px-1" title="Back to list">↩</button>
                                            </div>
                                          ) : (
                                          <select
                                            value={fab.operation}
                                            onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'operation', e.target.value)}
                                            className="w-full p-1 border rounded text-xs bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100"
                                          >
                                            <optgroup label="Cutting">
                                              {fabricationOperations.cutting.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Drilling">
                                              {fabricationOperations.drilling.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Prep">
                                              {fabricationOperations.prep.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Welding">
                                              {fabricationOperations.welding.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Coatings">
                                              {fabricationOperations.coatings.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Finishes">
                                              {fabricationOperations.finishes.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Handling">
                                              {fabricationOperations.handling.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Connections">
                                              {fabricationOperations.connections.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            {Object.entries(
                                              customOps.reduce((acc, op) => {
                                                (acc[op.category] = acc[op.category] || []).push(op);
                                                return acc;
                                              }, {})
                                            ).map(([cat, ops]) => (
                                              <optgroup key={`custom-${cat}`} label={cat}>
                                                {ops.map(op => <option key={op.name} value={op.name}>{op.name}</option>)}
                                              </optgroup>
                                            ))}
                                            <optgroup label="Other">
                                              <option value="Custom">— Custom —</option>
                                            </optgroup>
                                          </select>
                                          )}
                                        </td>
                                        {/* Category */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Size */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Wt/ft - show unit connWeight for connections (for verification) */}
                                        <td className="border p-1 text-right text-xs">
                                          {isConnection && fab.connWeight ? (
                                            <span className="text-blue-600">{fab.connWeight}</span>
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </td>
                                        {/* Qty */}
                                        <td className="border p-1">
                                          <div className="flex items-center justify-center gap-0.5">
                                            <button 
                                              onClick={() => updateMaterialFab(item.id, mat.id, fab.id, 'quantity', Math.max(0, (fab.quantity || 0) - 1))}
                                              className="px-1 py-0.5 bg-green-200 hover:bg-green-300 rounded text-xs font-bold"
                                            >−</button>
                                            <input 
                                              type="number" 
                                              step="1" 
                                              value={fab.quantity || ''} 
                                              onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'quantity', parseFloat(e.target.value) || 0)} 
                                              className="w-10 p-1 border rounded text-xs text-center bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="qty"
                                            />
                                            <button 
                                              onClick={() => updateMaterialFab(item.id, mat.id, fab.id, 'quantity', (fab.quantity || 0) + 1)}
                                              className="px-1 py-0.5 bg-green-200 hover:bg-green-300 rounded text-xs font-bold"
                                            >+</button>
                                          </div>
                                        </td>
                                        {/* Length (per operation) - disabled for connections */}
                                        <td className="border p-1">
                                          {isConnection ? (
                                            <span className="block text-center text-gray-400">—</span>
                                          ) : (fab.unit === 'IN' || fab.unit === 'LF') ? (
                                            <input 
                                              type="number" 
                                              step="0.1" 
                                              value={fab.length || ''} 
                                              onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'length', parseFloat(e.target.value) || 0)} 
                                              className="w-full p-1 border rounded text-xs text-right bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="len"
                                            />
                                          ) : (
                                            <span className="block text-center text-gray-400">—</span>
                                          )}
                                        </td>
                                        {/* Fab Wt - shows qty × connWeight for connections, extLen for length-based */}
                                        <td className="border p-1 text-right text-xs">
                                          {isConnection && fab.connWeight ? (
                                            <span className="text-blue-600 font-medium">{(fab.quantity || 0) * fab.connWeight}</span>
                                          ) : hasLength ? (
                                            extLen.toFixed(1)
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </td>
                                        {/* Galv - enabled for connections */}
                                        <td className="border p-1 text-center">
                                          {isConnection ? (
                                            <input 
                                              type="checkbox" 
                                              checked={fab.galvanized || false} 
                                              onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'galvanized', e.target.checked)} 
                                              className="w-4 h-4 rounded" 
                                              title="Add Galvanizing for connection material"
                                            />
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </td>
                                        {/* Stock */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Stks */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Stock Wt */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Units */}
                                        <td className="border p-1">
                                          <select 
                                            value={fab.unit} 
                                            onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'unit', e.target.value)} 
                                            className="w-full p-1 border rounded text-xs bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100"
                                          >
                                            <option value="EA">EA</option>
                                            <option value="IN">IN</option>
                                            <option value="LF">LF</option>
                                            <option value="LB">LB</option>
                                            <option value="HR">HR</option>
                                            <option value="SF">SF</option>
                                          </select>
                                        </td>
                                        {/* Rate */}
                                        <td className="border p-1">
                                          <input 
                                            type="number" 
                                            step="0.01" 
                                            value={fab.unitPrice || ''} 
                                            onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                                            className="w-full p-1 border rounded text-xs text-right bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                            placeholder="$0.00"
                                          />
                                        </td>
                                        {/* Total */}
                                        <td className="border p-1 text-right font-semibold text-green-700">{fmtPrice(fab.totalCost || 0)}</td>
                                        {/* Actions */}
                                        <td className="border p-1 text-center">
                                          <button onClick={() => deleteMaterialFab(item.id, mat.id, fab.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
                                        </td>
                                      </tr>
                                      );
                                    })}
                                    {/* Auto-generated galv fab row (if any) */}
                                    {(mat.fabrication || []).filter(f => f.isAutoGalv || f.isConnGalv).map(fab => (
                                      <tr key={fab.id} className="bg-yellow-50 dark:bg-yellow-950">
                                        <td className="border p-1 text-yellow-600 text-center text-xs font-medium">[Galv]</td>
                                        <td className="border p-1 text-xs text-yellow-700">{fab.description}</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-right text-xs">{fmtWt(fab.quantity)}</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-xs text-center">LB</td>
                                        <td className="border p-1">
                                          <input 
                                            type="number" 
                                            step="0.01" 
                                            value={fab.unitPrice || ''} 
                                            onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                                            className="w-full p-1 border rounded text-xs text-right bg-yellow-50 dark:bg-yellow-950 dark:border-gray-600 dark:text-gray-100" 
                                            placeholder="$/lb"
                                          />
                                        </td>
                                        <td className="border p-1 text-right font-semibold text-yellow-700">{fmtPrice(fab.totalCost || 0)}</td>
                                        <td className="border p-1"></td>
                                      </tr>
                                    ))}
                                    {/* Child rows (attachments) */}
                                    {getChildMaterials(item.materials, mat.id).map(child => (
                                      <React.Fragment key={child.id}>
                                      <tr
                                        className={isZeroWeight(child)
                                          ? 'bg-amber-50 dark:bg-amber-950 shadow-[inset_3px_0_0_0_#d97706]'
                                          : 'bg-gray-50 dark:bg-gray-800'}
                                        title={isZeroWeight(child) ? 'Zero weight with nonzero quantity — check size / custom weight' : undefined}
                                        draggable
                                        onDragStart={e => handleDragStart(e, item.id, child.id, false)}
                                        onDragOver={e => handleDragOver(e, item.id, child.id, false, child.parentMaterialId)}
                                        onDragLeave={() => setDropTarget(dt => dt?.materialId === child.id ? null : dt)}
                                        onDrop={e => handleDrop(e, item.id)}
                                        onDragEnd={handleDragEnd}
                                        style={dropTarget?.materialId === child.id ? {
                                          boxShadow: dropTarget.position === 'before'
                                            ? 'inset 0 3px 0 0 #3b82f6'
                                            : 'inset 0 -3px 0 0 #3b82f6'
                                        } : undefined}
                                      >
                                        <td className="border p-1 pl-3 text-gray-600 dark:text-gray-400 font-medium">
                                          <div className="flex items-center gap-0.5">
                                            <GripVertical size={10} className="text-gray-300 cursor-grab flex-shrink-0" />
                                            {child.sequence}
                                          </div>
                                        </td>
                                        <td className="border p-1"><input type="text" value={child.description || ''} onChange={e => updateMaterial(item.id, child.id, 'description', e.target.value)} className="w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="Attachment desc" /></td>
                                        <td className="border p-1">
                                          <select value={child.category} onChange={e => updateMaterial(item.id, child.id, 'category', e.target.value)} className="w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            <option value="Custom">Custom</option>
                                          </select>
                                        </td>
                                        <td className="border p-1">
                                          {child.category === 'Custom' ? (
                                            <input type="text" value={child.size || ''} onChange={e => updateMaterial(item.id, child.id, 'size', e.target.value)} className="w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                                          ) : child.category === 'Plate' ? (
                                            <div className="flex items-center gap-1">
                                              <select 
                                                value={child.plateThickness || ''} 
                                                onChange={e => updateMaterial(item.id, child.id, 'plateThickness', e.target.value)} 
                                                className="flex-1 p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                                              >
                                                <option value="">Thick</option>
                                                {plateThicknesses.map(t => <option key={t.label} value={t.value}>{t.label}</option>)}
                                              </select>
                                              <span className="text-gray-500 dark:text-gray-400">×</span>
                                              <input 
                                                type="number" 
                                                step="0.5" 
                                                value={child.plateWidth || ''} 
                                                onChange={e => updateMaterial(item.id, child.id, 'plateWidth', parseFloat(e.target.value) || 0)} 
                                                className="w-12 p-1 border rounded text-xs text-right bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                                                placeholder="W"
                                              />
                                              <span className="text-gray-500 dark:text-gray-400 text-xs">"</span>
                                            </div>
                                          ) : (
                                            <select value={child.size} onChange={e => updateMaterial(item.id, child.id, 'size', e.target.value)} className="w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                              {getShapesForCategory(child.category).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                          )}
                                        </td>
                                        <td className="border p-1">
                                          {child.category === 'Custom' ? (
                                            <input type="number" step="0.01" value={child.customWeight || ''} onChange={e => updateMaterial(item.id, child.id, 'customWeight', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded text-xs text-right bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                                          ) : child.category === 'Plate' ? (
                                            <span className="block text-right">{child.weightPerFoot?.toFixed(2) || '—'}</span>
                                          ) : (
                                            <span className="block text-right">{child.weightPerFoot?.toFixed(2)}</span>
                                          )}
                                        </td>
                                        <td className="border p-1">
                                          <div className="flex items-center justify-center gap-0.5">
                                            <button 
                                              onClick={() => updateMaterial(item.id, child.id, 'pieces', Math.max(1, (child.pieces || 1) - 1))}
                                              className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded text-xs font-bold"
                                            >−</button>
                                            <input 
                                              type="number" 
                                              value={child.pieces || ''} 
                                              onChange={e => updateMaterial(item.id, child.id, 'pieces', parseInt(e.target.value) || 0)} 
                                              className={`w-10 p-1 border rounded text-xs text-center dark:border-gray-600 dark:text-gray-100 ${child.inheritPieces ? 'bg-blue-50 dark:bg-blue-950 border-blue-300' : 'bg-gray-50 dark:bg-gray-800'}`}
                                              title={child.inheritPieces ? 'Inherited from parent' : 'Custom quantity'}
                                            />
                                            <button 
                                              onClick={() => updateMaterial(item.id, child.id, 'pieces', (child.pieces || 0) + 1)}
                                              className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded text-xs font-bold"
                                            >+</button>
                                          </div>
                                        </td>
                                        <td className="border p-1"><input type="number" step="0.01" value={child.length || ''} onChange={e => updateMaterial(item.id, child.id, 'length', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded text-xs text-right bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="0.00" /></td>
                                        <td className="border p-1 text-right bg-blue-50 dark:bg-blue-950">{fmtWt(child.fabWeight || 0)}</td>
                                        <td className="border p-1 text-center">
                                          <input type="checkbox" checked={child.galvanized || false} 
                                            onChange={e => updateMaterial(item.id, child.id, 'galvanized', e.target.checked)} 
                                            className="w-4 h-4 rounded" title="Add Galvanizing" />
                                        </td>
                                        <td className="border p-1">
                                          {child.pooled ? (
                                            <div
                                              className={`text-center text-xs font-semibold rounded px-1 py-0.5 ${child.overLength
                                                ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                                                : child.shortfall
                                                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                                  : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'}`}
                                              title={child.overLength
                                                ? 'Piece exceeds the longest available stock — review for splice or special order'
                                                : child.shortfall
                                                  ? "Supplier stick counts can't cover all of this size's cuts — see the Stock List shortfall warning"
                                                  : `Nested across items (standalone stock wt: ${fmtWt(child.standaloneStockWeight || 0)})`}
                                            >
                                              {child.overLength ? 'OVER LEN' : child.shortfall ? 'SHORT SUP' : `NESTED ${(100 / (child.nestYield || 1)).toFixed(0)}%`}
                                            </div>
                                          ) : (
                                            <select
                                              value={child.stockLength}
                                              onChange={e => updateMaterial(item.id, child.id, 'stockLength', parseFloat(e.target.value))}
                                              className={`w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${child.isManualOverride ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-400' : ''}`}
                                            >
                                              {availableLengthsFor(child.category, child.size).map(sl => (
                                                <option key={sl} value={sl}>
                                                  {sl}'{sl === child.optimalStockLength ? '*' : ''}
                                                </option>
                                              ))}
                                            </select>
                                          )}
                                        </td>
                                        <td className="border p-1 text-right bg-gray-100 dark:bg-gray-700">{child.pooled ? '—' : (child.stocksRequired || 0)}</td>
                                        <td className="border p-1 text-right bg-gray-100 dark:bg-gray-700">{fmtWt(child.stockWeight || 0)}</td>
                                        <td className="border p-1">
                                          <select value={child.priceBy}
                                            onChange={e => child.pooled
                                              ? applySizePrice(child.size, e.target.value, child.unitPrice || 0)
                                              : updateMaterial(item.id, child.id, 'priceBy', e.target.value)}
                                            title={child.pooled ? `Nested — applies to every ${child.size} line` : undefined}
                                            className="w-14 p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                            <option value="LB">LB</option><option value="CWT">CWT</option><option value="LF">LF</option><option value="EA">EA</option>
                                          </select>
                                        </td>
                                        <td className="border p-1"><input type="number" step="0.0001" value={child.unitPrice || ''}
                                          onChange={e => child.pooled
                                            ? applySizePrice(child.size, child.priceBy || 'LB', parseFloat(e.target.value) || 0)
                                            : updateMaterial(item.id, child.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                          title={child.pooled ? `Nested — rate applies to every ${child.size} line` : undefined}
                                          className="w-16 p-1 border rounded text-xs text-right bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                                        <td className="border p-1 text-right font-semibold bg-green-50 dark:bg-green-950">{fmtPrice(child.totalCost || 0)}</td>
                                        <td className="border p-1">
                                          <div className="flex gap-1">
                                            <button onClick={() => addMaterialFab(item.id, child.id)} className="text-green-600 hover:text-green-800" title="Add Fabrication"><Plus size={12} className="bg-green-100 rounded" /></button>
                                            <button onClick={() => deleteMaterial(item.id, child.id)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 size={12} /></button>
                                          </div>
                                        </td>
                                      </tr>
                                      {/* Child material fab rows */}
                                      {(child.fabrication || []).filter(f => !f.isAutoGalv && !f.isConnGalv).map(fab => {
                                        const isApplyToSelf = !fab.applyTo || fab.applyTo === 'self';
                                        const parentMat = item.materials.find(m => m.id === child.parentMaterialId);
                                        const siblingMats = item.materials.filter(m => m.parentMaterialId === child.parentMaterialId && m.id !== child.id);
                                        
                                        // Get target material for display
                                        const targetMat = !isApplyToSelf ? item.materials.find(m => m.id === fab.applyTo) : null;
                                        const targetPrefix = targetMat ? `↳ ${targetMat.sequence}: ` : '';
                                        
                                        const hasLength = (fab.unit === 'IN' || fab.unit === 'LF') && fab.length;
                                        const extLen = hasLength ? (fab.quantity || 0) * (fab.length || 0) : null;
                                        
                                        // Available operations based on applyTo
                                        const availableOps = isApplyToSelf 
                                          ? [...fabricationOperations.cutting, ...fabricationOperations.drilling, ...fabricationOperations.prep, ...fabricationOperations.welding, ...fabricationOperations.coatings, ...fabricationOperations.finishes, ...fabricationOperations.handling]
                                          : fabricationOperations.welding;
                                        
                                        return (
                                        <tr
                                          key={fab.id}
                                          className="bg-green-50 dark:bg-green-950"
                                          draggable
                                          onDragStart={e => handleFabDragStart(e, item.id, child.id, fab.id)}
                                          onDragOver={e => handleFabDragOver(e, item.id, child.id, fab.id)}
                                          onDragLeave={() => setFabDropTarget(dt => dt?.fabId === fab.id ? null : dt)}
                                          onDrop={e => handleFabDrop(e, item.id, child.id)}
                                          onDragEnd={handleFabDragEnd}
                                          style={fabDropTarget?.fabId === fab.id ? {
                                            boxShadow: fabDropTarget.position === 'before'
                                              ? 'inset 0 3px 0 0 #22c55e'
                                              : 'inset 0 -3px 0 0 #22c55e'
                                          } : undefined}
                                        >
                                          {/* Seq */}
                                          <td className="border p-1 text-green-600 text-center text-xs font-medium">
                                            <div className="flex items-center justify-center gap-0.5">
                                              <GripVertical size={10} className="text-green-400 cursor-grab flex-shrink-0" />
                                              <span>[Fab]</span>
                                            </div>
                                          </td>
                                          {/* Description - shows ↳ A: prefix + operation */}
                                          <td className="border p-1">
                                            <div className="flex items-center gap-1">
                                              {!isApplyToSelf && (
                                                <select 
                                                  value={fab.applyTo || 'self'} 
                                                  onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'applyTo', e.target.value === 'self' ? 'self' : parseInt(e.target.value) || e.target.value)} 
                                                  className="p-1 border rounded text-xs bg-green-100 dark:bg-gray-700 w-16 dark:border-gray-600 dark:text-gray-100"
                                                  title="Apply To"
                                                >
                                                  <option value="self">Self</option>
                                                  {parentMat && <option value={parentMat.id}>↳ {parentMat.sequence}</option>}
                                                  {siblingMats.map(m => (
                                                    <option key={m.id} value={m.id}>↳ {m.sequence}</option>
                                                  ))}
                                                </select>
                                              )}
                                              {isApplyToSelf && (
                                                <select 
                                                  value={fab.applyTo || 'self'} 
                                                  onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'applyTo', e.target.value === 'self' ? 'self' : parseInt(e.target.value) || e.target.value)} 
                                                  className="p-1 border rounded text-xs bg-green-50 dark:bg-green-950 w-16 dark:border-gray-600 dark:text-gray-100"
                                                  title="Apply To"
                                                >
                                                  <option value="self">Self</option>
                                                  {parentMat && <option value={parentMat.id}>↳ {parentMat.sequence}</option>}
                                                  {siblingMats.map(m => (
                                                    <option key={m.id} value={m.id}>↳ {m.sequence}</option>
                                                  ))}
                                                </select>
                                              )}
                                              {fab.operation === 'Custom' ? (
                                                <div className="flex gap-1 items-center flex-1">
                                                  <input
                                                    type="text"
                                                    value={fab.customOperation || ''}
                                                    onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'customOperation', e.target.value)}
                                                    placeholder="Custom operation..."
                                                    className="flex-1 p-1 border border-orange-300 rounded text-xs bg-orange-50"
                                                    autoFocus
                                                  />
                                                  <button onClick={() => updateMaterialFab(item.id, child.id, fab.id, 'operation', 'Welding- Fillet')} className="text-gray-400 hover:text-gray-600 text-xs px-1" title="Back to list">↩</button>
                                                </div>
                                              ) : (
                                              <select
                                                value={fab.operation}
                                                onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'operation', e.target.value)}
                                                className="flex-1 p-1 border rounded text-xs bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100"
                                              >
                                                {isApplyToSelf ? (
                                                  <>
                                                    <optgroup label="Cutting">
                                                      {fabricationOperations.cutting.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Drilling">
                                                      {fabricationOperations.drilling.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Prep">
                                                      {fabricationOperations.prep.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Welding">
                                                      {fabricationOperations.welding.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Coatings">
                                                      {fabricationOperations.coatings.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Finishes">
                                                      {fabricationOperations.finishes.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Handling">
                                                      {fabricationOperations.handling.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                  </>
                                                ) : (
                                                  <optgroup label="Welding">
                                                    {fabricationOperations.welding.map(op => <option key={op} value={op}>{op}</option>)}
                                                  </optgroup>
                                                )}
                                                {Object.entries(
                                                  customOps.reduce((acc, op) => {
                                                    (acc[op.category] = acc[op.category] || []).push(op);
                                                    return acc;
                                                  }, {})
                                                ).map(([cat, ops]) => (
                                                  <optgroup key={`custom-${cat}`} label={cat}>
                                                    {ops.map(op => <option key={op.name} value={op.name}>{op.name}</option>)}
                                                  </optgroup>
                                                ))}
                                                <optgroup label="Other">
                                                  <option value="Custom">— Custom —</option>
                                                </optgroup>
                                              </select>
                                              )}
                                            </div>
                                          </td>
                                          {/* Category */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Size */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Wt/ft */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Qty (per piece) */}
                                          <td className="border p-1">
                                            <div className="flex items-center justify-center gap-0.5">
                                              <button 
                                                onClick={() => updateMaterialFab(item.id, child.id, fab.id, 'quantity', Math.max(0, (fab.quantity || 0) - 1))}
                                                className="px-1 py-0.5 bg-green-200 hover:bg-green-300 rounded text-xs font-bold"
                                              >−</button>
                                              <input 
                                                type="number" 
                                                step="1" 
                                                value={fab.quantity || ''} 
                                                onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'quantity', parseFloat(e.target.value) || 0)} 
                                                className="w-10 p-1 border rounded text-xs text-center bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                                placeholder="qty"
                                              />
                                              <button 
                                                onClick={() => updateMaterialFab(item.id, child.id, fab.id, 'quantity', (fab.quantity || 0) + 1)}
                                                className="px-1 py-0.5 bg-green-200 hover:bg-green-300 rounded text-xs font-bold"
                                              >+</button>
                                            </div>
                                          </td>
                                          {/* Length (per operation) */}
                                          <td className="border p-1">
                                            {(fab.unit === 'IN' || fab.unit === 'LF') ? (
                                              <input 
                                                type="number" 
                                                step="0.1" 
                                                value={fab.length || ''} 
                                                onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'length', parseFloat(e.target.value) || 0)} 
                                                className="w-full p-1 border rounded text-xs text-right bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                                placeholder="len"
                                              />
                                            ) : (
                                              <span className="block text-center text-gray-400">—</span>
                                            )}
                                          </td>
                                          {/* Ext Len */}
                                          <td className="border p-1 text-right text-xs">
                                            {hasLength ? extLen.toFixed(1) : <span className="text-gray-400">—</span>}
                                          </td>
                                          {/* Galv */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Stock */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Stks */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Stock Wt */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Units */}
                                          <td className="border p-1">
                                            <select 
                                              value={fab.unit} 
                                              onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'unit', e.target.value)} 
                                              className="w-full p-1 border rounded text-xs bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100"
                                            >
                                              <option value="EA">EA</option>
                                              <option value="IN">IN</option>
                                              <option value="LF">LF</option>
                                              <option value="LB">LB</option>
                                              <option value="HR">HR</option>
                                              <option value="SF">SF</option>
                                            </select>
                                          </td>
                                          {/* Rate */}
                                          <td className="border p-1">
                                            <input 
                                              type="number" 
                                              step="0.01" 
                                              value={fab.unitPrice || ''} 
                                              onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                                              className="w-full p-1 border rounded text-xs text-right bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="$0.00"
                                            />
                                          </td>
                                          {/* Total */}
                                          <td className="border p-1 text-right font-semibold text-green-700">{fmtPrice(fab.totalCost || 0)}</td>
                                          {/* Actions */}
                                          <td className="border p-1 text-center">
                                            <button onClick={() => deleteMaterialFab(item.id, child.id, fab.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
                                          </td>
                                        </tr>
                                        );
                                      })}
                                      {/* Auto-generated galv fab row for child (if any) */}
                                      {(child.fabrication || []).filter(f => f.isAutoGalv || f.isConnGalv).map(fab => (
                                        <tr key={fab.id} className="bg-yellow-50 dark:bg-yellow-950">
                                          <td className="border p-1 text-yellow-600 text-center text-xs font-medium">[Galv]</td>
                                          <td className="border p-1 text-xs text-yellow-700">{fab.description}</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-right text-xs">{fmtWt(fab.quantity)}</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-xs text-center">LB</td>
                                          <td className="border p-1">
                                            <input 
                                              type="number" 
                                              step="0.01" 
                                              value={fab.unitPrice || ''} 
                                              onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                                              className="w-full p-1 border rounded text-xs text-right bg-yellow-50 dark:bg-yellow-950 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="$/lb"
                                            />
                                          </td>
                                          <td className="border p-1 text-right font-semibold text-yellow-700">{fmtPrice(fab.totalCost || 0)}</td>
                                          <td className="border p-1"></td>
                                        </tr>
                                      ))}
                                      </React.Fragment>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Item-Level Fabrication (General) */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Item Fabrication (General)</h3>
                          <button onClick={() => addFabrication(item.id)} className="flex items-center gap-1 bg-green-600 text-white px-2 py-1 rounded text-xs"><Plus size={14} /> Add General Fab</button>
                        </div>
                        {item.fabrication.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                  <th className="border p-1 text-left">Operation</th>
                                  <th className="border p-1 text-left">Description</th>
                                  <th className="border p-1 text-right">Qty</th>
                                  <th className="border p-1 text-left">Unit</th>
                                  <th className="border p-1 text-right">Rate</th>
                                  <th className="border p-1 text-right">Total</th>
                                  <th className="border p-1"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.fabrication.map(fab => (
                                  <tr key={fab.id}>
                                    <td className="border p-1">
                                      {fab.operation === 'Custom' ? (
                                        <div className="flex gap-1 items-center">
                                          <input
                                            type="text"
                                            value={fab.customOperation || ''}
                                            onChange={e => updateFabrication(item.id, fab.id, 'customOperation', e.target.value)}
                                            placeholder="Custom operation..."
                                            className="flex-1 p-1 border border-orange-300 rounded text-xs bg-orange-50"
                                            autoFocus
                                          />
                                          <button onClick={() => updateFabrication(item.id, fab.id, 'operation', 'Handling')} className="text-gray-400 hover:text-gray-600 text-xs px-1" title="Back to list">↩</button>
                                        </div>
                                      ) : (
                                      <select value={fab.operation} onChange={e => updateFabrication(item.id, fab.id, 'operation', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                        <optgroup label="Handling">
                                          {fabricationOperations.handling.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Coatings">
                                          {fabricationOperations.coatings.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Finishes">
                                          {fabricationOperations.finishes.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Cutting">
                                          {fabricationOperations.cutting.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Drilling">
                                          {fabricationOperations.drilling.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Prep">
                                          {fabricationOperations.prep.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Welding">
                                          {fabricationOperations.welding.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Other">
                                          <option value="Custom">— Custom —</option>
                                        </optgroup>
                                      </select>
                                      )}
                                    </td>
                                    <td className="border p-1"><input type="text" value={fab.description || ''} onChange={e => updateFabrication(item.id, fab.id, 'description', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="description" /></td>
                                    <td className="border p-1"><input type="number" step="0.1" value={fab.quantity || ''} onChange={e => updateFabrication(item.id, fab.id, 'quantity', parseFloat(e.target.value) || 0)} className="w-16 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="qty" /></td>
                                    <td className="border p-1">
                                      <select value={fab.unit} onChange={e => updateFabrication(item.id, fab.id, 'unit', e.target.value)} className="w-14 p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                        <option value="EA">EA</option><option value="HR">HR</option><option value="LF">LF</option><option value="LB">LB</option><option value="SF">SF</option><option value="LS">LS</option>
                                      </select>
                                    </td>
                                    <td className="border p-1"><input type="number" step="0.01" value={fab.unitPrice || ''} onChange={e => updateFabrication(item.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} className="w-16 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="$0.00" /></td>
                                    <td className="border p-1 text-right font-semibold bg-green-50 dark:bg-green-950">{fmtPrice(fab.totalCost || 0)}</td>
                                    <td className="border p-1"><button onClick={() => deleteFabrication(item.id, fab.id)} className="text-red-600"><Trash2 size={12} /></button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Item Summary + Snapshots */}
                      <div className="bg-gray-200 dark:bg-gray-600 rounded p-3 mt-2 flex gap-4 items-start">

                        {/* Blueprint Snapshots — left panel */}
                        <div
                          className="flex-1 min-w-0"
                          onPaste={(e) => handleSnapshotPaste(item.id, e)}
                        >
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Blueprint Snapshots</div>
                          <div className="flex flex-wrap gap-2">
                            {(item.snapshots || []).map(snap => (
                              <div key={snap.id} className="relative group w-28">
                                <img
                                  src={snap.imageData}
                                  alt={snap.caption || 'Snapshot'}
                                  className="w-28 h-20 object-cover rounded border border-gray-300 dark:border-gray-600 cursor-pointer hover:opacity-90"
                                  onClick={() => setLightboxSrc(snap.imageData)}
                                />
                                <button
                                  onClick={() => removeSnapshot(item.id, snap.id)}
                                  className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none"
                                  title="Remove"
                                >×</button>
                                <input
                                  type="text"
                                  value={snap.caption}
                                  onChange={e => updateSnapshotCaption(item.id, snap.id, e.target.value)}
                                  placeholder="Caption..."
                                  className="w-full mt-0.5 p-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
                                />
                              </div>
                            ))}

                            {/* Add snapshot cell */}
                            <label className="w-28 h-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-400 dark:border-gray-500 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 text-xs gap-1">
                              <span className="text-2xl leading-none">+</span>
                              <span>Add Image</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={async (e) => {
                                  if (e.target.files[0]) {
                                    await addSnapshot(item.id, e.target.files[0]);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">Ctrl+V to paste from clipboard</div>
                        </div>

                        {/* Cost Summary — right panel */}
                        <div className="shrink-0">
                        <div className="grid grid-cols-2 gap-y-1 text-xs">
                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2">Total Fab Wt:</div>
                          <div className="text-right text-blue-800 font-bold">
                            {fmtWt(
                              item.materials.reduce((sum, m) => sum + (m.fabWeight || 0), 0) +
                              item.materials.reduce((sum, m) => 
                                sum + ((m.fabrication || []).reduce((fs, f) => 
                                  fs + (CONNECTION_WEIGHT_OPS.has(f.operation) && f.connWeight
                                    ? (f.quantity || 0) * f.connWeight 
                                    : 0), 0)), 0)
                            )} lbs
                          </div>

                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2">Material Cost:</div>
                          <div className="text-right text-gray-700 dark:text-gray-300 font-semibold">
                            {fmtPrice(item.materials.reduce((sum, m) => sum + (m.totalCost || 0), 0))}
                          </div>

                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2 flex items-center justify-end gap-1">
                            Material Markup
                            <input 
                              type="number" 
                              step="0.5" 
                              value={item.materialMarkup || ''} 
                              onChange={e => updateItem(item.id, 'materialMarkup', parseFloat(e.target.value) || 0)} 
                              className="w-14 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                              placeholder="0"
                            />%:
                          </div>
                          <div className="text-right text-gray-700 dark:text-gray-300 font-semibold">
                            {fmtPrice(item.materials.reduce((sum, m) => sum + (m.totalCost || 0), 0) * (item.materialMarkup || 0) / 100)}
                          </div>

                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2 pt-1 border-t border-gray-300 dark:border-gray-600">Fabrication Cost:</div>
                          <div className="text-right text-gray-700 dark:text-gray-300 font-semibold pt-1 border-t border-gray-300 dark:border-gray-600">
                            {fmtPrice(
                              item.materials.reduce((sum, m) => sum + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0) +
                              item.fabrication.reduce((sum, f) => sum + (f.totalCost || 0), 0)
                            )}
                          </div>

                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2 flex items-center justify-end gap-1">
                            Fab Markup
                            <input 
                              type="number" 
                              step="0.5" 
                              value={item.fabMarkup || ''} 
                              onChange={e => updateItem(item.id, 'fabMarkup', parseFloat(e.target.value) || 0)} 
                              className="w-14 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                              placeholder="0"
                            />%:
                          </div>
                          <div className="text-right text-gray-700 dark:text-gray-300 font-semibold">
                            {fmtPrice(
                              (item.materials.reduce((sum, m) => sum + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0) +
                              item.fabrication.reduce((sum, f) => sum + (f.totalCost || 0), 0)) * (item.fabMarkup || 0) / 100
                            )}
                          </div>

                          <div className="text-right text-green-800 font-bold pr-2 pt-1 border-t-2 border-gray-400 dark:border-gray-500">Total Item Cost:</div>
                          <div className="text-right text-green-800 font-bold pt-1 border-t-2 border-gray-400 dark:border-gray-500">
                            {fmtPrice(
                              // Material cost with material markup
                              (item.materials.reduce((sum, m) => sum + (m.totalCost || 0), 0)) * (1 + (item.materialMarkup || 0) / 100) +
                              // Fab cost with fab markup
                              (item.materials.reduce((sum, m) => sum + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0) +
                              item.fabrication.reduce((sum, f) => sum + (f.totalCost || 0), 0)) * (1 + (item.fabMarkup || 0) / 100)
                            )}
                          </div>
                        </div>
                        </div>{/* end shrink-0 cost panel */}
                      </div>{/* end flex grey band */}
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addItem} className="w-full p-3 border-2 border-dashed border-gray-400 dark:border-gray-500 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2">
                <Plus size={18} /> Add New Item
              </button>

              {/* Totals */}
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded border grid grid-cols-2 md:grid-cols-7 gap-4">
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Total Fab Wt: </span><span className="text-lg font-bold text-blue-700">{fmtWt(totals.totalFabWeight + totals.totalConnectionWeight)} lbs</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Stock Weight: </span><span className="text-lg font-bold">{fmtWt(totals.totalStockWeight)} lbs</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Material: </span><span className="text-lg font-bold">{fmtPrice(totals.totalMaterialCost)}</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Mat Markup: </span><span className="text-lg font-bold">{fmtPrice(totals.totalMaterialMarkup)}</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Fabrication: </span><span className="text-lg font-bold">{fmtPrice(totals.totalFabricationCost)}</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Fab Markup: </span><span className="text-lg font-bold">{fmtPrice(totals.totalFabMarkup)}</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Grand Total: </span><span className="text-xl font-bold text-green-700">{fmtPrice(totals.grandTotal)}</span></div>
              </div>
            </div>
          )}

          {/* STOCK LIST TAB */}
          {activeTab === 'stocklist' && (
            <div className="space-y-4">
              <div className="bg-gray-700 dark:bg-gray-600 text-white p-4 rounded flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">Stock Material Buy List</h2>
                  <p className="text-sm text-gray-300">{projectName || 'Project'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportStockListCsv}
                    title="Download the priced buy list as CSV"
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/40 text-white rounded font-semibold hover:bg-white/20 text-sm"
                  >
                    <Download size={16} /> CSV
                  </button>
                  <button
                    onClick={handleExportStockListPdf}
                    disabled={pdfExporting}
                    title="Download the priced buy list as a printable PDF"
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/40 text-white rounded font-semibold hover:bg-white/20 text-sm disabled:opacity-50"
                  >
                    <Download size={16} /> {pdfExporting ? 'Generating…' : 'PDF'}
                  </button>
                  <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 cursor-pointer text-sm">
                    <Upload size={16} />
                    Upload Vendor CSV
                    <input type="file" accept=".csv" className="hidden" onChange={handleRfqPricingUpload} />
                  </label>
                  <button
                    onClick={() => setShowRfqModal(true)}
                    className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 px-4 py-2 rounded font-semibold hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Request Vendor Pricing
                  </button>
                </div>
              </div>
              {rfqUploadResult && (
                <div className={`text-sm px-3 py-2 rounded ${rfqUploadResult.error ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400' : 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400'}`}>
                  {rfqUploadResult.error
                    ? rfqUploadResult.error
                    : <>✓ Pricing applied to {rfqUploadResult.matched} of {rfqUploadResult.total} shapes.
                        {rfqUploadResult.unmatched?.length > 0 && <span className="text-amber-600 dark:text-amber-400"> Not matched: {rfqUploadResult.unmatched.join(', ')}</span>}</>
                  }
                </div>
              )}
              
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={stockListFilter}
                  onChange={e => setStockListFilter(e.target.value)}
                  placeholder="Filter by size (e.g. L5x5, HSS6, W12)"
                  className="flex-1 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                />
                {stockListFilter && (
                  <button
                    onClick={() => setStockListFilter('')}
                    className="px-3 py-2 text-sm border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Clear
                  </button>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {displayedStockList.length} of {detailedStockList.length} rows
                </span>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-600">
                    <th className="border p-2 text-left cursor-pointer select-none hover:bg-gray-300 dark:hover:bg-gray-500" onClick={() => toggleStockSort('itemNumber')}>Item #{sortArrow('itemNumber')}</th>
                    <th className="border p-2 text-left cursor-pointer select-none hover:bg-gray-300 dark:hover:bg-gray-500" onClick={() => toggleStockSort('size')}>Size{sortArrow('size')}</th>
                    <th className="border p-2 text-right cursor-pointer select-none hover:bg-gray-300 dark:hover:bg-gray-500" onClick={() => toggleStockSort('stockLength')}>Stock Length{sortArrow('stockLength')}</th>
                    <th className="border p-2 text-right cursor-pointer select-none hover:bg-gray-300 dark:hover:bg-gray-500" onClick={() => toggleStockSort('totalStocks')}>Qty Stocks{sortArrow('totalStocks')}</th>
                    <th className="border p-2 text-right">Wt/ft</th>
                    <th className="border p-2 text-right cursor-pointer select-none hover:bg-gray-300 dark:hover:bg-gray-500" onClick={() => toggleStockSort('totalWeight')}>Total Weight{sortArrow('totalWeight')}</th>
                    <th className="border p-2 text-center" title="Supplier price basis — applies to every line of this size">Units</th>
                    <th className="border p-2 text-right" title="Supplier rate — applies to every line of this size">Rate $</th>
                    <th className="border p-2 text-right">Est Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStockList.map((stock, i) => {
                    const sp = sizePricing.get(stock.size);
                    const rowEstCost = stockRowEstCost(stock, sp);
                    return (
                    <tr key={i} className={stock.pooled ? 'bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}>
                      <td className="border p-2">
                        {stock.pooled
                          ? <span className="font-semibold text-indigo-700 dark:text-indigo-300" title={stock.itemName}>Pooled</span>
                          : stock.itemNumber}
                      </td>
                      <td className="border p-2 font-semibold">{stock.size}</td>
                      <td className="border p-2 text-right">{stock.stockLength}'</td>
                      <td className="border p-2 text-right font-bold">{stock.totalStocks}</td>
                      <td className="border p-2 text-right">{(stock.weightPerFoot || 0).toFixed(2)}</td>
                      <td className="border p-2 text-right font-semibold">{fmtWt(stock.totalWeight)} lbs</td>
                      <td className="border p-1 text-center">
                        <select
                          value={sp?.mixed ? '' : (sp?.priceBy || 'LB')}
                          onChange={e => applySizePrice(stock.size, e.target.value, sp?.mixed ? 0 : (sp?.unitPrice || 0))}
                          className="p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                        >
                          {sp?.mixed && <option value="">—</option>}
                          <option value="LB">LB</option>
                          <option value="CWT">CWT</option>
                          <option value="LF">LF</option>
                          {sp?.priceBy === 'EA' && !sp?.mixed && <option value="EA">EA</option>}
                        </select>
                      </td>
                      <td className="border p-1 text-right">
                        <input
                          type="number" step="0.0001" min="0"
                          value={sp?.mixed ? '' : (sp?.unitPrice || '')}
                          placeholder={sp?.mixed ? 'mixed' : ''}
                          onChange={e => applySizePrice(stock.size, (sp && !sp.mixed && sp.priceBy) || 'LB', parseFloat(e.target.value) || 0)}
                          title="Applies to every material line of this size"
                          className="w-20 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                        />
                      </td>
                      <td className="border p-2 text-right font-semibold">{rowEstCost == null ? '—' : fmtPrice(rowEstCost)}</td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-200 dark:bg-gray-600 font-bold">
                    <td className="border p-2" colSpan={5}>TOTAL{stockListFilter ? ' (filtered)' : ''}</td>
                    <td className="border p-2 text-right">{fmtWt(displayedStockList.reduce((s, r) => s + r.totalWeight, 0))} lbs</td>
                    <td className="border p-2" colSpan={2}></td>
                    <td className="border p-2 text-right">
                      {fmtPrice(displayedStockList.reduce((s, r) => s + (stockRowEstCost(r, sizePricing.get(r.size)) || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Over-length warnings from the nest */}
              {projectNest && projectNest.groups.some(g => g.overLengthCuts.length > 0) && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-300 rounded p-3 text-sm">
                  <p className="font-semibold text-red-700 dark:text-red-300 mb-1 flex items-center gap-1">
                    <AlertCircle size={16} /> Pieces longer than available stock — review for splice or special-order length:
                  </p>
                  <ul className="text-red-700 dark:text-red-300 ml-5 list-disc">
                    {projectNest.groups.filter(g => g.overLengthCuts.length > 0).map(g => (
                      <li key={g.key}>
                        {g.size}: {g.overLengthCuts.map(c => `${+c.length.toFixed(2)}' (Item ${c.itemNumber})`).join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Supplier quantity shortfalls from the nest */}
              {projectNest && projectNest.groups.some(g => g.shortfallCuts.length > 0) && (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-300 rounded p-3 text-sm">
                  <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1">
                    <AlertCircle size={16} /> Supplier quantities short — these cuts fit available lengths but exceed the stick counts:
                  </p>
                  <ul className="text-amber-800 dark:text-amber-300 ml-5 list-disc">
                    {projectNest.groups.filter(g => g.shortfallCuts.length > 0).map(g => {
                      const ft = g.shortfallCuts.reduce((s, c) => s + c.length, 0);
                      const lbs = ft * (g.weightPerFoot || 0);
                      return (
                        <li key={g.key}>
                          {g.size}: {g.shortfallCuts.length} cut{g.shortfallCuts.length === 1 ? '' : 's'} / {+ft.toFixed(2)}' (~{fmtWt(lbs)} lbs) uncovered —
                          {' '}{g.shortfallCuts.map(c => `${+c.length.toFixed(2)}' (Item ${c.itemNumber})`).join(', ')}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Raise the stick limits, enable more lengths, or source the remainder from another supplier. Shortfall cuts are carried at exact length in the totals so the estimate stays whole.
                  </p>
                </div>
              )}

              {/* Cut detail (cut tickets) for nested groups */}
              {projectNest && projectNest.groups.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 border rounded">
                  <div className="flex items-center">
                    <button
                      onClick={() => setShowCutDetail(v => !v)}
                      className="flex-1 p-3 flex items-center justify-between text-left font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                      <span className="flex items-center gap-2">
                        {showCutDetail ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        Cut Detail — nested sticks ({projectNest.groups.reduce((s, g) => s + g.sticks.length, 0)} sticks across {projectNest.groups.length} size group{projectNest.groups.length === 1 ? '' : 's'})
                      </span>
                      <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                        Overall yield {(projectNest.groups.reduce((s, g) => s + g.netLengthFt, 0) /
                          Math.max(projectNest.groups.reduce((s, g) => s + g.buyLengthFt, 0), 0.001) * 100).toFixed(1)}%
                      </span>
                    </button>
                    <button
                      onClick={handleExportCutDetailPdf}
                      disabled={pdfExporting}
                      title="Download the cut detail as a printable PDF (nest record / cut ticket)"
                      className="flex items-center gap-1 mx-3 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      <Download size={14} /> {pdfExporting ? 'Generating…' : 'PDF'}
                    </button>
                  </div>
                  {showCutDetail && (
                    <div className="p-3 pt-0 space-y-3">
                      {projectNest.groups.map(g => {
                        const compressed = compressGroupSticks(g);
                        return (
                          <div key={g.key}>
                            <p className="font-semibold text-sm mb-1">
                              {g.size}
                              <span className="font-normal text-xs text-gray-500 dark:text-gray-400 ml-2">
                                {g.sticks.length} stick{g.sticks.length === 1 ? '' : 's'}, yield {(100 / g.yield).toFixed(1)}%
                              </span>
                            </p>
                            <div className="space-y-0.5">
                              {compressed.map((row, ri) => (
                                <div key={ri} className="text-xs font-mono bg-white dark:bg-gray-900 border rounded px-2 py-1 flex justify-between gap-3">
                                  <span>
                                    {row.count > 1 ? `${row.count} × ` : ''}{row.stockLength}' stick:
                                    {' '}{row.parts.map(p => `${p.n} × ${+p.len.toFixed(2)}' [Item ${p.itemNo}]`).join('  +  ')}
                                  </span>
                                  <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                    drop {(row.stockLength - row.usedFt).toFixed(2)}'
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Supplier stock-length availability */}
              {sizesInUse.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 border rounded">
                  <button
                    onClick={() => setShowAvailability(v => !v)}
                    className="w-full p-3 flex items-center justify-between text-left font-semibold hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <span className="flex items-center gap-2">
                      {showAvailability ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      Supplier Stock Lengths
                      {Object.keys(stockLengthOverrides).length > 0 && (
                        <span className="text-xs font-normal px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                          {Object.keys(stockLengthOverrides).length} size{Object.keys(stockLengthOverrides).length === 1 ? '' : 's'} amended
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                      Toggle lengths the supplier can ship — nesting and stock picks follow
                    </span>
                  </button>
                  {showAvailability && (
                    <div className="p-3 pt-0 space-y-2">
                      {sizesInUse.map(({ size, category }) => {
                        const defaults = getStockLengthsForCategory(category);
                        const active = availableLengthsFor(category, size);
                        const caps = lengthCapsFor(category, size);
                        const all = [...new Set([...defaults, ...active])].sort((a, b) => a - b);
                        const amended = !!stockLengthOverrides[size];
                        return (
                          <div key={size} className="flex items-center gap-1.5 flex-wrap text-sm">
                            <span className="font-semibold w-32 flex-shrink-0">{size}</span>
                            {all.map(len => {
                              const on = active.includes(len);
                              return (
                                <span key={len} className="inline-flex items-center">
                                  <button
                                    onClick={() => toggleSizeLength(category, size, len)}
                                    className={`px-2 py-0.5 border text-xs ${on ? 'rounded-l' : 'rounded'} ${on
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600 line-through'}`}
                                    title={on ? 'Available — click to mark unavailable' : 'Unavailable — click to restore'}
                                  >
                                    {len}'
                                  </button>
                                  {on && (
                                    <input
                                      type="number" min="1" placeholder="∞"
                                      value={caps[len] ?? ''}
                                      onChange={e => setSizeLengthCap(category, size, len, e.target.value)}
                                      title={`Max ${len}' sticks this supplier can supply (blank = unlimited)`}
                                      className={`w-9 px-0.5 py-0.5 border border-l-0 rounded-r text-[11px] text-center dark:bg-gray-800 dark:text-gray-100 ${caps[len] > 0 ? 'border-amber-400 bg-amber-50 dark:bg-amber-950 font-semibold' : 'border-blue-600 dark:border-gray-600'}`}
                                    />
                                  )}
                                </span>
                              );
                            })}
                            <input
                              type="number" min="1" step="0.5" placeholder="+ len"
                              value={customLenInputs[size] || ''}
                              onChange={e => setCustomLenInputs(p => ({ ...p, [size]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  addCustomSizeLength(category, size, customLenInputs[size]);
                                  setCustomLenInputs(p => ({ ...p, [size]: '' }));
                                }
                              }}
                              title="Add a custom length (e.g. mill order) — press Enter"
                              className="w-16 p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                            />
                            {amended && (
                              <button onClick={() => resetSizeLengths(size)} className="text-xs text-blue-600 hover:underline">reset</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* RFQ Modal */}
              {showRfqModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
                    <div className="bg-gray-700 dark:bg-gray-600 text-white p-4 rounded-t-lg flex justify-between items-center">
                      <h3 className="text-lg font-bold">Request for Quotation (RFQ)</h3>
                      <button onClick={() => { setShowRfqModal(false); setRfqUploadResult(null); }} className="text-white hover:text-gray-300 text-2xl">&times;</button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                      {/* Project Info Summary */}
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                        <h4 className="font-semibold mb-2">Project Information</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <p><span className="text-gray-600 dark:text-gray-400">Project:</span> {projectName || 'Not specified'}</p>
                          <p><span className="text-gray-600 dark:text-gray-400">Location:</span> {projectAddress || 'Not specified'}</p>
                        </div>
                      </div>

                      {/* RFQ Details */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quote Needed By</label>
                          <input 
                            type="date" 
                            value={rfqResponseDate} 
                            onChange={e => setRfqResponseDate(e.target.value)}
                            className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery Required By</label>
                          <input 
                            type="date" 
                            value={rfqDeliveryDate} 
                            onChange={e => setRfqDeliveryDate(e.target.value)}
                            className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          />
                        </div>
                      </div>

                      {/* Material Summary */}
                      <div>
                        <h4 className="font-semibold mb-2">Material Summary ({stockList.length} items, {fmtWt(totals.totalStockWeight)} lbs total)</h4>
                        <div className="max-h-48 overflow-y-auto border rounded">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                              <tr>
                                <th className="p-2 text-left">Size</th>
                                <th className="p-2 text-right">Length</th>
                                <th className="p-2 text-right">Qty</th>
                                <th className="p-2 text-right">Wt/ft</th>
                                <th className="p-2 text-right">Est. Weight</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stockList.map((stock, i) => (
                                <tr key={i} className="border-t">
                                  <td className="p-2">{stock.size}</td>
                                  <td className="p-2 text-right">{stock.stockLength}'</td>
                                  <td className="p-2 text-right">{stock.totalStocks}</td>
                                  <td className="p-2 text-right">{(stock.weightPerFoot || 0).toFixed(2)}</td>
                                  <td className="p-2 text-right">{fmtWt(stock.totalWeight)} lbs</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Special Instructions */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Special Instructions / Notes</label>
                        <textarea 
                          value={rfqNotes}
                          onChange={e => setRfqNotes(e.target.value)}
                          className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          rows={3}
                          placeholder="Mill certs required, specific mill preferences, delivery instructions, etc."
                        />
                      </div>

                      {/* Vendor List */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold">Vendor Contact List</h4>
                          <button 
                            onClick={addRfqVendor}
                            className="text-sm bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded hover:bg-gray-300"
                          >
                            + Add Vendor
                          </button>
                        </div>
                        <div className="space-y-2">
                          {rfqVendors.map((vendor, i) => (
                            <div key={vendor.id} className="grid grid-cols-12 gap-2 items-center">
                              <input 
                                type="text" 
                                placeholder="Vendor Name"
                                value={vendor.name}
                                onChange={e => updateRfqVendor(vendor.id, 'name', e.target.value)}
                                className="col-span-4 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                              />
                              <input 
                                type="email" 
                                placeholder="Email"
                                value={vendor.email}
                                onChange={e => updateRfqVendor(vendor.id, 'email', e.target.value)}
                                className="col-span-4 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                              />
                              <input 
                                type="tel" 
                                placeholder="Phone"
                                value={vendor.phone}
                                onChange={e => updateRfqVendor(vendor.id, 'phone', e.target.value)}
                                className="col-span-3 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                              />
                              <button 
                                onClick={() => removeRfqVendor(vendor.id)}
                                className="col-span-1 text-red-600 hover:text-red-800"
                                disabled={rfqVendors.length <= 1}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Export Options */}
                      <div className="border-t pt-4">
                        <h4 className="font-semibold mb-3">Export Options</h4>
                        <div className="grid grid-cols-3 gap-4">
                          <button 
                            onClick={copyRfqToClipboard}
                            className="flex flex-col items-center gap-2 p-4 border-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400"
                          >
                            <Copy size={24} className="text-gray-600 dark:text-gray-400" />
                            <span className="font-medium">Copy to Clipboard</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Paste into email</span>
                          </button>
                          <button 
                            onClick={downloadRfqCsv}
                            className="flex flex-col items-center gap-2 p-4 border-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400"
                          >
                            <Download size={24} className="text-gray-600 dark:text-gray-400" />
                            <span className="font-medium">Download CSV</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Opens in Excel</span>
                          </button>
                          <button 
                            onClick={() => {
                              setShowRfqModal(false);
                              setActiveTab('rfqprint');
                            }}
                            className="flex flex-col items-center gap-2 p-4 border-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400"
                          >
                            <FileText size={24} className="text-gray-600 dark:text-gray-400" />
                            <span className="font-medium">Print RFQ</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Professional format</span>
                          </button>
                        </div>
                      </div>

                      {/* Import Vendor Response */}
                      <div className="border-t pt-4">
                        <h4 className="font-semibold mb-1">Import Vendor Response</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Upload the completed RFQ CSV to apply vendor pricing to the estimate.</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer text-sm font-medium">
                            <Upload size={16} />
                            Upload Vendor CSV
                            <input type="file" accept=".csv" className="hidden" onChange={handleRfqPricingUpload} />
                          </label>
                          {rfqUploadResult && (
                            rfqUploadResult.error
                              ? <p className="text-sm text-red-600">{rfqUploadResult.error}</p>
                              : <p className="text-sm text-green-700">
                                  ✓ Pricing applied to {rfqUploadResult.matched} of {rfqUploadResult.total} shapes.
                                  {rfqUploadResult.unmatched.length > 0 && (
                                    <span className="text-amber-600"> Not matched: {rfqUploadResult.unmatched.join(', ')}</span>
                                  )}
                                </p>
                          )}
                        </div>
                      </div>

                    </div>

                    <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end gap-2">
                      <button
                        onClick={() => { setShowRfqModal(false); setRfqUploadResult(null); }}
                        className="px-4 py-2 border rounded hover:bg-gray-200"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* RFQ PRINT TAB (hidden from tab bar) */}
          {activeTab === 'rfqprint' && (
            <div className="bg-white dark:bg-gray-900 max-w-4xl mx-auto" style={{ padding: '0.5in' }}>
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  .rfq-printable, .rfq-printable * { visibility: visible; }
                  .rfq-printable { position: absolute; left: 0; top: 0; width: 8.5in; }
                  .no-print { display: none !important; }
                }
              `}</style>
              
              <div className="rfq-printable">
                <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
                  <h1 className="text-2xl font-bold">REQUEST FOR QUOTATION</h1>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div>
                    <p><span className="font-semibold">Date:</span> {new Date().toLocaleDateString()}</p>
                    <p><span className="font-semibold">Project:</span> {projectName || '_______________'}</p>
                    <p><span className="font-semibold">Location:</span> {projectAddress || '_______________'}</p>
                  </div>
                  <div>
                    <p><span className="font-semibold">Quote Needed By:</span> {rfqResponseDate ? new Date(rfqResponseDate).toLocaleDateString() : '_______________'}</p>
                    <p><span className="font-semibold">Delivery Required:</span> {rfqDeliveryDate ? new Date(rfqDeliveryDate).toLocaleDateString() : '_______________'}</p>
                    <p><span className="font-semibold">Contact:</span> {estimatedBy || '_______________'}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="font-bold border-b border-gray-400 dark:border-gray-500 pb-1 mb-2">MATERIAL LIST</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-200 dark:bg-gray-600">
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-left">Size</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Length</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Qty</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Wt/ft</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Est. Weight</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Your $/LB</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Your Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockList.map((stock, i) => (
                        <tr key={i}>
                          <td className="border border-gray-400 dark:border-gray-500 p-2">{stock.size}</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{stock.stockLength}'</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{stock.totalStocks}</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{(stock.weightPerFoot || 0).toFixed(2)}</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{fmtWt(stock.totalWeight)} lbs</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">$</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">$</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-200 dark:bg-gray-600 font-bold">
                        <td className="border border-gray-400 dark:border-gray-500 p-2" colSpan={4}>TOTALS</td>
                        <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{fmtWt(totals.totalStockWeight)} lbs</td>
                        <td className="border border-gray-400 dark:border-gray-500 p-2"></td>
                        <td className="border border-gray-400 dark:border-gray-500 p-2">$</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {rfqNotes && (
                  <div className="mb-6">
                    <h3 className="font-bold border-b border-gray-400 dark:border-gray-500 pb-1 mb-2">SPECIAL INSTRUCTIONS</h3>
                    <p className="text-sm">{rfqNotes}</p>
                  </div>
                )}

                <div className="mb-6 p-4 border-2 border-gray-800">
                  <h3 className="font-bold mb-3">VENDOR QUOTE SUMMARY</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="mb-2">Total Material Price: $_______________</p>
                      <p className="mb-2">Delivery Charge: $_______________</p>
                      <p className="font-bold">TOTAL QUOTE: $_______________</p>
                    </div>
                    <div>
                      <p className="mb-2">Lead Time: _______________ days</p>
                      <p className="mb-2">Quote Valid Until: _______________</p>
                      <p className="mb-2">Mill Certs Included: Yes / No</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mt-8">
                  <div>
                    <p className="text-sm mb-1">Vendor Company:</p>
                    <div className="border-b border-gray-800 w-full mb-4"></div>
                    <p className="text-sm mb-1">Vendor Rep:</p>
                    <div className="border-b border-gray-800 w-full mb-4"></div>
                    <p className="text-sm mb-1">Phone:</p>
                    <div className="border-b border-gray-800 w-full mb-4"></div>
                    <p className="text-sm mb-1">Email:</p>
                    <div className="border-b border-gray-800 w-full"></div>
                  </div>
                  <div>
                    <p className="text-sm mb-1">Signature:</p>
                    <div className="border-b border-gray-800 w-full mt-8 mb-4"></div>
                    <p className="text-sm mb-1">Date:</p>
                    <div className="border-b border-gray-800 w-full"></div>
                  </div>
                </div>
              </div>

              <div className="no-print mt-6 flex justify-center gap-4">
                <button 
                  onClick={() => setActiveTab('stocklist')}
                  className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Back to Stock List
                </button>
                <button 
                  onClick={() => window.print()}
                  className="bg-gray-700 dark:bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-800"
                >
                  Print RFQ
                </button>
              </div>
            </div>
          )}

          {/* RECAP TAB */}
          {activeTab === 'recap' && (
            <div className="space-y-4">
              <div className="bg-gray-700 dark:bg-gray-600 text-white p-4 rounded flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">Cost Recap by Item</h2>
                  <p className="text-sm text-gray-300">Assign installation, drafting, engineering, PM, shipping, and custom costs with markups</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="New column name..."
                    className="px-2 py-1 rounded text-gray-800 dark:text-gray-200 text-sm w-40"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        addCustomRecapColumn(e.target.value);
                        e.target.value = '';
                      }
                    }}
                  />
                  <button
                    onClick={e => {
                      const input = e.target.previousSibling;
                      if (input.value.trim()) {
                        addCustomRecapColumn(input.value);
                        input.value = '';
                      }
                    }}
                    className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    + Add Column
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-200 dark:bg-gray-600">
                      <th className="border p-2 text-left" rowSpan={2}>Item</th>
                      <th className="border p-2 text-center" colSpan={2}>Installation</th>
                      <th className="border p-2 text-center" colSpan={2}>Drafting</th>
                      <th className="border p-2 text-center" colSpan={2}>Engineering</th>
                      <th className="border p-2 text-center" colSpan={2}>Project Mgmt</th>
                      <th className="border p-2 text-center" colSpan={2}>Shipping</th>
                      {customRecapColumns.map(col => (
                        <th key={col.key} className="border p-2 text-center bg-blue-100" colSpan={2}>
                          <div className="flex items-center justify-center gap-1">
                            <span>{col.name}</span>
                            <button onClick={() => removeCustomRecapColumn(col.key)} className="text-red-500 hover:text-red-700 text-xs ml-1" title="Remove column">×</button>
                          </div>
                        </th>
                      ))}
                      {taxCategory && (
                        <th className="border p-2 text-center bg-amber-100" rowSpan={2}>
                          <div className="text-xs">
                            <div className="font-bold">Tax ({(TAX_RATE * 100).toFixed(2)}%)</div>
                            <div className="font-normal text-amber-700">{taxCategoryDescriptions[taxCategory].label}</div>
                          </div>
                        </th>
                      )}
                      <th className="border p-2 text-right" rowSpan={2}>Item Total</th>
                    </tr>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th className="border p-1 text-center text-xs">Cost</th>
                      <th className="border p-1 text-center text-xs">Markup %</th>
                      <th className="border p-1 text-center text-xs">Cost</th>
                      <th className="border p-1 text-center text-xs">Markup %</th>
                      <th className="border p-1 text-center text-xs">Cost</th>
                      <th className="border p-1 text-center text-xs">Markup %</th>
                      <th className="border p-1 text-center text-xs">Hrs</th>
                      <th className="border p-1 text-center text-xs">$/Hr</th>
                      <th className="border p-1 text-center text-xs">Cost</th>
                      <th className="border p-1 text-center text-xs">Markup %</th>
                      {customRecapColumns.map(col => (
                        <React.Fragment key={col.key}>
                          <th className="border p-1 text-center text-xs bg-blue-50 dark:bg-blue-950">Cost</th>
                          <th className="border p-1 text-center text-xs bg-blue-50 dark:bg-blue-950">Markup %</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
                      const matMarkupAmt = matCost * (item.materialMarkup || 0) / 100;
                      const matFabCost = item.materials.reduce((s, m) => s + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0);
                      const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
                      const fabCost = matFabCost + itemFabCost;
                      const fabMarkupAmt = fabCost * (item.fabMarkup || 0) / 100;
                      const recapTotal = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
                      const itemTax = calculateItemTax(item);
                      const itemTotal = matCost + matMarkupAmt + fabCost + fabMarkupAmt + recapTotal + itemTax;
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="border p-2">
                            <span className="font-mono text-xs">{item.itemNumber}</span> - <span className="font-semibold">{item.itemName}</span>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Mat: {fmtPrice(matCost)}{matMarkupAmt > 0 ? ` (+${fmtPrice(matMarkupAmt)})` : ''} | Fab: {fmtPrice(fabCost)}{fabMarkupAmt > 0 ? ` (+${fmtPrice(fabMarkupAmt)})` : ''}</div>
                          </td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.installation?.cost || ''} onChange={e => updateRecapCost(item.id, 'installation', 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.installation?.markup || ''} onChange={e => updateRecapCost(item.id, 'installation', 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.drafting?.cost || ''} onChange={e => updateRecapCost(item.id, 'drafting', 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.drafting?.markup || ''} onChange={e => updateRecapCost(item.id, 'drafting', 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.engineering?.cost || ''} onChange={e => updateRecapCost(item.id, 'engineering', 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.engineering?.markup || ''} onChange={e => updateRecapCost(item.id, 'engineering', 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="0.5" value={item.recapCosts.projectManagement?.hours || ''} onChange={e => updateRecapCost(item.id, 'projectManagement', 'hours', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.projectManagement?.rate || ''} onChange={e => updateRecapCost(item.id, 'projectManagement', 'rate', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.shipping?.cost || ''} onChange={e => updateRecapCost(item.id, 'shipping', 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.shipping?.markup || ''} onChange={e => updateRecapCost(item.id, 'shipping', 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          {customRecapColumns.map(col => (
                            <React.Fragment key={col.key}>
                              <td className="border p-1 bg-blue-50 dark:bg-blue-950"><input type="number" step="1" value={item.recapCosts[col.key]?.cost || ''} onChange={e => updateRecapCost(item.id, col.key, 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center bg-blue-50 dark:bg-blue-950 dark:border-gray-600 dark:text-gray-100" /></td>
                              <td className="border p-1 bg-blue-50 dark:bg-blue-950"><input type="number" step="1" value={item.recapCosts[col.key]?.markup || ''} onChange={e => updateRecapCost(item.id, col.key, 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center bg-blue-50 dark:bg-blue-950 dark:border-gray-600 dark:text-gray-100" /></td>
                            </React.Fragment>
                          ))}
                          {taxCategory && (
                            <td className="border p-2 text-right bg-amber-50 dark:bg-amber-950 font-medium text-amber-800">{fmtPrice(itemTax)}</td>
                          )}
                          <td className="border p-2 text-right font-bold bg-green-50 dark:bg-green-950">{fmtPrice(itemTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-200 dark:bg-gray-600 font-bold">
                      <td className="border p-2">TOTALS</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.installation?.total || 0), 0))}</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.drafting?.total || 0), 0))}</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.engineering?.total || 0), 0))}</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.projectManagement?.total || 0), 0))}</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.shipping?.total || 0), 0))}</td>
                      {customRecapColumns.map(col => (
                        <td key={col.key} className="border p-2 text-center bg-blue-100" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts[col.key]?.total || 0), 0))}</td>
                      ))}
                      {taxCategory && (
                        <td className="border p-2 text-right bg-amber-100 text-amber-800 font-bold">{fmtPrice(items.reduce((s, i) => s + calculateItemTax(i), 0))}</td>
                      )}
                      <td className="border p-2 text-right text-green-700">{fmtPrice(totals.totalMaterialCost + totals.totalMaterialMarkup + totals.totalFabricationCost + totals.totalFabMarkup + totals.totalRecapCosts + items.reduce((s, i) => s + calculateItemTax(i), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Recap Summary */}
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded border">
                <div className={`grid gap-4 ${customRecapColumns.length > 0 ? 'grid-cols-3 md:grid-cols-' + (6 + customRecapColumns.length) : 'grid-cols-2 md:grid-cols-6'}`}>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Installation</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.installation?.total || 0), 0))}</p></div>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Drafting</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.drafting?.total || 0), 0))}</p></div>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Engineering</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.engineering?.total || 0), 0))}</p></div>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Project Mgmt</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.projectManagement?.total || 0), 0))}</p></div>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Shipping</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.shipping?.total || 0), 0))}</p></div>
                  {customRecapColumns.map(col => (
                    <div key={col.key} className="text-center bg-blue-50 dark:bg-blue-950 p-2 rounded"><p className="text-xs text-blue-700">{col.name}</p><p className="text-lg font-bold text-blue-800">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts[col.key]?.total || 0), 0))}</p></div>
                  ))}
                  {taxCategory && (
                    <div className="text-center bg-amber-50 dark:bg-amber-950 p-2 rounded">
                      <p className="text-xs text-amber-700">Tax ({taxCategoryDescriptions[taxCategory].label})</p>
                      <p className="text-lg font-bold text-amber-800">{fmtPrice(items.reduce((s, i) => s + calculateItemTax(i), 0))}</p>
                    </div>
                  )}
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Recap Total</p><p className="text-lg font-bold text-blue-700">{fmtPrice(totals.totalRecapCosts + items.reduce((s, i) => s + calculateItemTax(i), 0))}</p></div>
                </div>
              </div>

              {taxCategory && taxCategory !== 'resale' && taxCategory !== 'noTax' && (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                      <Calculator size={16} />
                      Tax Calculation Details ({taxCategoryDescriptions[taxCategory].label} @ {(TAX_RATE * 100).toFixed(2)}%)
                    </h3>
                    <button
                      onClick={() => setShowTaxBreakdown(!showTaxBreakdown)}
                      className="text-sm text-amber-700 hover:text-amber-900 underline"
                      data-testid="button-toggle-tax-breakdown"
                    >
                      {showTaxBreakdown ? 'Hide Details' : 'Show Per-Item Breakdown'}
                    </button>
                  </div>

                  <div className="bg-white dark:bg-gray-900 rounded border border-amber-100 p-3 mb-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{taxCategoryDescriptions[taxCategory].description}</p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-semibold text-green-800">Taxable:</p>
                        {taxCategory === 'newConstruction' && <p className="text-gray-600 dark:text-gray-400">Materials + Material Markup</p>}
                        {taxCategory === 'fob' && <p className="text-gray-600 dark:text-gray-400">Materials + Material Markup + Fabrication + Fab Markup</p>}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-500 dark:text-gray-400">Not Taxed:</p>
                        {taxCategory === 'newConstruction' && <p className="text-gray-600 dark:text-gray-400">Fabrication, Fab Markup, Installation, Drafting, Engineering, PM, Shipping</p>}
                        {taxCategory === 'fob' && <p className="text-gray-600 dark:text-gray-400">Installation, Drafting, Engineering, PM, Shipping</p>}
                      </div>
                    </div>
                  </div>

                  {showTaxBreakdown && (
                    <table className="w-full text-xs border-collapse bg-white dark:bg-gray-900 rounded" data-testid="table-tax-breakdown">
                      <thead>
                        <tr className="bg-amber-100">
                          <th className="border border-amber-200 p-2 text-left">Item</th>
                          <th className="border border-amber-200 p-2 text-right">Material Cost</th>
                          <th className="border border-amber-200 p-2 text-right">Mat Markup</th>
                          {taxCategory === 'fob' && <th className="border border-amber-200 p-2 text-right">Fab Cost</th>}
                          {taxCategory === 'fob' && <th className="border border-amber-200 p-2 text-right">Fab Markup</th>}
                          <th className="border border-amber-200 p-2 text-right font-bold">Taxable Base</th>
                          <th className="border border-amber-200 p-2 text-right font-bold">Tax ({(TAX_RATE * 100).toFixed(2)}%)</th>
                          <th className="border border-amber-200 p-2 text-right text-gray-500 dark:text-gray-400">Not Taxed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(item => {
                          const bd = getItemTaxBreakdown(item);
                          return (
                            <tr key={item.id} className="hover:bg-amber-50 dark:hover:bg-amber-950" data-testid={`row-tax-breakdown-${item.id}`}>
                              <td className="border border-amber-200 p-2">
                                <span className="font-mono">{item.itemNumber}</span> - {item.itemName}
                              </td>
                              <td className="border border-amber-200 p-2 text-right">{fmtPrice(bd.matCost)}</td>
                              <td className="border border-amber-200 p-2 text-right">{bd.matMarkup > 0 ? fmtPrice(bd.matMarkup) : '-'}</td>
                              {taxCategory === 'fob' && <td className="border border-amber-200 p-2 text-right">{fmtPrice(bd.fabCost)}</td>}
                              {taxCategory === 'fob' && <td className="border border-amber-200 p-2 text-right">{bd.fabMarkup > 0 ? fmtPrice(bd.fabMarkup) : '-'}</td>}
                              <td className="border border-amber-200 p-2 text-right font-semibold text-green-800">{fmtPrice(bd.taxableBase)}</td>
                              <td className="border border-amber-200 p-2 text-right font-bold text-amber-800">{fmtPrice(bd.taxAmount)}</td>
                              <td className="border border-amber-200 p-2 text-right text-gray-500 dark:text-gray-400">
                                {bd.notTaxed.length > 0 ? bd.notTaxed.join(', ') : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-amber-100 font-bold">
                          <td className="border border-amber-200 p-2">TOTALS</td>
                          <td className="border border-amber-200 p-2 text-right">{fmtPrice(items.reduce((s, i) => s + i.materials.reduce((ms, m) => ms + (m.totalCost || 0), 0), 0))}</td>
                          <td className="border border-amber-200 p-2 text-right">{fmtPrice(items.reduce((s, i) => { const mc = i.materials.reduce((ms, m) => ms + (m.totalCost || 0), 0); return s + mc * (i.materialMarkup || 0) / 100; }, 0))}</td>
                          {taxCategory === 'fob' && <td className="border border-amber-200 p-2 text-right">{fmtPrice(totals.totalFabricationCost)}</td>}
                          {taxCategory === 'fob' && <td className="border border-amber-200 p-2 text-right">{fmtPrice(totals.totalFabMarkup)}</td>}
                          <td className="border border-amber-200 p-2 text-right font-bold text-green-800">{fmtPrice(items.reduce((s, i) => s + getItemTaxBreakdown(i).taxableBase, 0))}</td>
                          <td className="border border-amber-200 p-2 text-right font-bold text-amber-800">{fmtPrice(totals.totalTax)}</td>
                          <td className="border border-amber-200 p-2 text-right text-gray-500 dark:text-gray-400">{fmtPrice(items.reduce((s, i) => { const bd = getItemTaxBreakdown(i); return s + bd.fabCost + bd.fabMarkup + bd.recapTotal; }, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SUMMARY TAB */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="bg-gray-700 dark:bg-gray-600 text-white p-4 rounded">
                <h2 className="text-xl font-bold">Estimate Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 text-sm">
                  <p><span className="text-gray-400">Project:</span> {projectName || '-'}</p>
                  <p><span className="text-gray-400">Customer:</span> {customerName || '-'}</p>
                  <p><span className="text-gray-400">Estimator:</span> {estimatedBy || '-'}</p>
                </div>
                <div className="mt-2 text-sm">
                  <span className="text-gray-400">Type: </span>
                  {[
                    projectTypes.structural && 'Structural',
                    projectTypes.miscellaneous && 'Miscellaneous',
                    projectTypes.ornamental && 'Ornamental',
                    ...customProjectTypes,
                  ].filter(Boolean).join(', ') || '-'}
                </div>
                <div className="mt-1 text-sm">
                  <span className="text-gray-400">Delivery: </span>
                  {[
                    deliveryOptions.installed && 'Installed',
                    deliveryOptions.fobJobsite && 'F.O.B. Jobsite',
                    deliveryOptions.willCall && 'Will Call',
                    selectedCustomDelivery,
                  ].filter(Boolean).join(', ') || '-'}
                </div>
                <div className="mt-1 text-sm">
                  <span className="text-gray-400">Tax Category: </span>
                  {taxCategory ? (
                    <span className="font-medium">{taxCategoryDescriptions[taxCategory].label} ({(TAX_RATE * 100).toFixed(2)}%)</span>
                  ) : '-'}
                </div>
              </div>

              {/* Item Summary */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-600">
                    <th className="border p-2 text-left">Item</th>
                    <th className="border p-2 text-left">Breakout</th>
                    <th className="border p-2 text-right">Fab Wt</th>
                    <th className="border p-2 text-right">Material</th>
                    <th className="border p-2 text-right">Fabrication</th>
                    <th className="border p-2 text-right">Recap</th>
                    <th className="border p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
                    const matFabCost = item.materials.reduce((s, m) => s + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0);
                    const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
                    const fabCost = matFabCost + itemFabCost;
                    const fabWt = item.materials.reduce((s, m) => s + (m.fabWeight || 0), 0);
                    const recapCost = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
                    const group = breakoutGroups.find(g => g.id === item.breakoutGroupId);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="border p-2"><span className="font-mono text-xs">{item.itemNumber}</span> - {item.itemName}</td>
                        <td className="border p-1">
                          <select
                            value={item.breakoutGroupId || ''}
                            onChange={e => updateItem(item.id, 'breakoutGroupId', e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          >
                            <option value="">Base Bid</option>
                            {breakoutGroups.map(g => (
                              <option key={g.id} value={g.id}>
                                {g.name || 'Unnamed'} ({g.type === 'add' ? 'ADD' : g.type === 'deduct' ? 'DED' : 'BASE'})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="border p-2 text-right">{fmtWt(fabWt)} lbs</td>
                        <td className="border p-2 text-right">{fmtPrice(matCost)}</td>
                        <td className="border p-2 text-right">{fmtPrice(fabCost)}</td>
                        <td className="border p-2 text-right">{fmtPrice(recapCost)}</td>
                        <td className="border p-2 text-right font-bold">{fmtPrice(matCost + fabCost + recapCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Breakout Groups Management */}
              <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded border border-yellow-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-yellow-800">Breakout Groups (Alternates)</h3>
                  <button
                    onClick={addBreakoutGroup}
                    className="flex items-center gap-1 bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
                  >
                    <Plus size={14} /> Add Group
                  </button>
                </div>
                
                {breakoutGroups.length === 0 ? (
                  <p className="text-sm text-yellow-700">No breakout groups defined. All items are included in the base bid.</p>
                ) : (
                  <div className="space-y-2">
                    {breakoutGroups.map(group => {
                      const groupItems = items.filter(i => i.breakoutGroupId === group.id);
                      const groupTotal = groupItems.reduce((s, i) => s + getItemTotal(i), 0);
                      return (
                        <div key={group.id} className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded border">
                          <input
                            type="text"
                            placeholder="Group Name (e.g., Canopy, Stair #1)"
                            value={group.name}
                            onChange={e => updateBreakoutGroup(group.id, 'name', e.target.value)}
                            className="flex-1 p-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          />
                          <select
                            value={group.type}
                            onChange={e => updateBreakoutGroup(group.id, 'type', e.target.value)}
                            className="p-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          >
                            <option value="base">Base</option>
                            <option value="deduct">Deduct</option>
                            <option value="add">Add</option>
                          </select>
                          <span className="text-sm font-mono w-24 text-right">
                            {fmtPrice(groupTotal)}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-16">
                            ({groupItems.length} items)
                          </span>
                          <button
                            onClick={() => deleteBreakoutGroup(group.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {breakoutGroups.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-yellow-300 text-sm">
                    <p className="text-yellow-800 font-medium">Quote Preview:</p>
                    {(() => {
                      const breakouts = breakoutTotals;
                      return (
                        <div className="mt-2 space-y-1">
                          <p className="font-bold">Base Bid: {fmtPrice(breakouts.baseBid)}</p>
                          {breakouts.deducts.length > 0 && (
                            <div className="ml-4">
                              <p className="text-xs text-gray-600 dark:text-gray-400">DEDUCT OPTIONS:</p>
                              {breakouts.deducts.map(d => (
                                <p key={d.id} className="text-red-700">- {d.name || 'Unnamed'}: -{fmtPrice(d.total)}</p>
                              ))}
                            </div>
                          )}
                          {breakouts.adds.length > 0 && (
                            <div className="ml-4">
                              <p className="text-xs text-gray-600 dark:text-gray-400">ADD OPTIONS:</p>
                              {breakouts.adds.map(a => (
                                <p key={a.id} className="text-green-700">+ {a.name || 'Unnamed'}: +{fmtPrice(a.total)}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* General Adjustments */}
              <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded border border-yellow-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-yellow-800">General Adjustments (Internal Only)</h3>
                  <button
                    onClick={addAdjustment}
                    className="flex items-center gap-1 bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
                  >
                    <Plus size={14} /> Add Adjustment
                  </button>
                </div>
                
                {adjustments.length === 0 ? (
                  <p className="text-sm text-yellow-700">No adjustments. Use for rounding, contingency, GC discounts, etc.</p>
                ) : (
                  <div className="space-y-2">
                    {adjustments.map(adj => (
                      <div key={adj.id} className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded border">
                        <span className="text-sm text-gray-600 dark:text-gray-400">$</span>
                        <input
                          type="number"
                          step="1"
                          placeholder="+/- Amount"
                          value={adj.amount || ''}
                          onChange={e => updateAdjustment(adj.id, 'amount', e.target.value)}
                          className="w-28 p-1 border rounded text-sm text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                        />
                        <input
                          type="text"
                          placeholder="Note (e.g., Rounding, Contingency, GC Discount)"
                          value={adj.note}
                          onChange={e => updateAdjustment(adj.id, 'note', e.target.value)}
                          className="flex-1 p-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                        />
                        <button
                          onClick={() => deleteAdjustment(adj.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="text-right text-sm font-semibold pt-2 border-t">
                      Total Adjustments: <span className={totals.totalAdjustments >= 0 ? 'text-green-700' : 'text-red-700'}>{fmtPrice(totals.totalAdjustments)}</span>
                    </div>
                  </div>
                )}
                <p className="text-xs text-yellow-600 mt-2">* Adjustments are baked into the final total but NOT shown separately on the quote.</p>
              </div>

              {/* Grand Totals */}
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded border">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm">Fab Weight: <span className="font-bold text-blue-700">{fmtWt(totals.totalFabWeight)} lbs</span></p>
                    <p className="text-sm">Stock Weight: <span className="font-bold">{fmtWt(totals.totalStockWeight)} lbs</span></p>
                    <p className="text-sm">Waste: <span className="font-bold text-orange-600">{fmtWt(totals.totalStockWeight - totals.totalFabWeight)} lbs</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">Materials: {fmtPrice(totals.totalMaterialCost)}</p>
                    <p className="text-sm">Fabrication: {fmtPrice(totals.totalFabricationCost)}</p>
                    <p className="text-sm">Recap Costs: {fmtPrice(totals.totalRecapCosts)}</p>
                    {totals.totalTax > 0 && (
                      <p className="text-sm">Tax ({taxCategoryDescriptions[taxCategory]?.label}): <span className="text-amber-700">{fmtPrice(totals.totalTax)}</span></p>
                    )}
                    {totals.totalAdjustments !== 0 && (
                      <p className="text-sm">Adjustments: <span className={totals.totalAdjustments >= 0 ? 'text-green-700' : 'text-red-700'}>{fmtPrice(totals.totalAdjustments)}</span></p>
                    )}
                    <p className="text-xl font-bold mt-2 text-green-700">TOTAL: {fmtPrice(totals.grandTotal)}</p>
                  </div>
                </div>
              </div>

              {/* Exclusions & Qualifications */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-red-50 dark:bg-red-950 p-4 rounded border border-red-200">
                  <h3 className="font-semibold text-red-800 mb-2">Exclusions</h3>
                  <ul className="text-sm space-y-1">
                    {[...selectedExclusions, ...customExclusions].map((exc, i) => (
                      <li key={i} className="text-red-700">- {exc}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded border border-blue-200">
                  <h3 className="font-semibold text-blue-800 mb-2">Qualifications</h3>
                  <ul className="text-sm space-y-1">
                    {[...selectedQualifications, ...customQualifications].map((qual, i) => (
                      <li key={i} className="text-blue-700">- {qual}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* QUOTE TAB */}
          {activeTab === 'quote' && (
            <div className="bg-white dark:bg-gray-900 max-w-4xl mx-auto" style={{ minHeight: '11in', padding: '0.5in' }}>
              {/* Print styles */}
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  .quote-printable, .quote-printable * { visibility: visible; }
                  .quote-printable { position: absolute; left: 0; top: 0; width: 8.5in; }
                  .no-print { display: none !important; }
                }
              `}</style>
              
              <div className="quote-printable">
                {/* Company Header */}
                <div className="border-b-2 border-gray-800 pb-4 mb-4">
                  <img src={COMPANY_LOGO} alt="Company Logo" style={{ height: '60px' }} />
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mt-2">QUOTATION</h1>
                </div>

                {/* Legal Terms Block */}
                <div className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed" style={{ fontSize: '9px' }}>
                  <p className="mb-1">
                    We propose to furnish the following described materials for the above structure, in accordance with the conditions of the Code of Standard Practice of American Institute of Steel Construction and the following terms and conditions, which upon acceptance by you of this proposal, are agreed to and accepted by you.
                  </p>
                  {(!taxCategory || taxCategory === 'resale' || taxCategory === 'noTax') && (
                    <p className="mb-1">
                      <span className="font-semibold">NOTE:</span> The prices quoted in the proposal DO NOT INCLUDE TAX OF ANY NATURE, "STATE, FEDERAL, LOCAL OR USE."
                    </p>
                  )}
                  <p>
                    <span className="font-semibold">Acceptance & Approval of Contract:</span> This proposal is made for acceptance by you in writing within 30 days from this date, and shall become a contract only upon approval thereafter by our Contracting Manager, or other authorized personnel.
                  </p>
                </div>

                {/* Project Information */}
                <div className="mb-6 border-t border-gray-300 dark:border-gray-600 pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p>{customerName || '_______________'}</p>
                      <p>{billingAddress || '_______________'}</p>
                      <p>{customerContact || '_______________'}</p>
                      <p>{customerEmail || '_______________'}</p>
                    </div>
                    <div className="text-right">
                      <p>{new Date().toLocaleDateString()}</p>
                      <p><span className="font-semibold">JOB:</span> {projectName || '_______________'}</p>
                      <p><span className="font-semibold">LOCATION:</span> {projectAddress || '_______________'}</p>
                      <p><span className="font-semibold">ARCHITECT:</span> {architect || '_______________'}</p>
                      <p><span className="font-semibold">DRAWING SET:</span> {drawingRevision || '_______________'}{drawingDate ? `, ${new Date(drawingDate).toLocaleDateString()}` : ''}</p>
                    </div>
                  </div>
                </div>

                {/* Greeting */}
                <div className="mb-4 text-sm">
                  <p>Valued Customer,</p>
                  <p className="mt-2">We are pleased to quote you on the following {[
                    projectTypes.structural && 'structural',
                    projectTypes.miscellaneous && 'miscellaneous',
                    projectTypes.ornamental && 'ornamental',
                    ...customProjectTypes.map(t => t.toLowerCase()),
                  ].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1') || '_______________'} metal items in accordance with the drawings dated {drawingDate ? new Date(drawingDate).toLocaleDateString() : '_______________'}:</p>
                </div>

                {/* Item List */}
                <div className="mb-6">
                  {(() => {
                    const breakouts = breakoutTotals;
                    const baseItems = items.filter(item => {
                      const group = breakoutGroups.find(g => g.id === item.breakoutGroupId);
                      return !group || group.type === 'base' || group.type === 'deduct';
                    });
                    const addItems = items.filter(item => {
                      const group = breakoutGroups.find(g => g.id === item.breakoutGroupId);
                      return group && group.type === 'add';
                    });
                    
                    return (
                      <>
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b-2 border-gray-800">
                              <th className="text-left p-2 font-semibold">Item #</th>
                              <th className="text-left p-2 font-semibold">Description</th>
                              <th className="text-left p-2 font-semibold">Drawing Reference</th>
                            </tr>
                          </thead>
                          <tbody>
                            {baseItems.map(item => (
                              <tr key={item.id} className="border-b border-gray-300 dark:border-gray-600">
                                <td className="p-2 font-mono">{item.itemNumber}</td>
                                <td className="p-2">{item.itemName}</td>
                                <td className="p-2">{item.drawingRef || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        
                        {addItems.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Additional items available (see Add Options below):</p>
                            <table className="w-full text-sm border-collapse">
                              <tbody>
                                {addItems.map(item => (
                                  <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                                    <td className="p-1 font-mono text-xs">{item.itemNumber}</td>
                                    <td className="p-1 text-xs">{item.itemName}</td>
                                    <td className="p-1 text-xs">{item.drawingRef || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Total Statement with Breakouts */}
                {(() => {
                  const breakouts = breakoutTotals;
                  const hasBreakouts = breakouts.deducts.length > 0 || breakouts.adds.length > 0;
                  const deliveryText = [
                    deliveryOptions.installed && 'INSTALLED',
                    deliveryOptions.fobJobsite && 'F.O.B. JOBSITE',
                    deliveryOptions.willCall && 'WILL CALL',
                    selectedCustomDelivery && selectedCustomDelivery.toUpperCase(),
                  ].filter(Boolean).join(', ') || '_______________';
                  
                  return (
                    <>
                      <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-700 border-2 border-gray-800 text-center">
                        <p className="text-lg">
                          <span className="font-semibold">{hasBreakouts ? 'BASE BID' : 'ALL FOR THE SUM OF'}</span>
                          <span> ..........</span>
                          <span className="font-semibold">{deliveryText}</span>
                          <span>.............. </span>
                          <span className="inline-block text-right" style={{ minWidth: '0' }}>
                            <span className="text-xl font-bold" style={{ borderBottom: '2px solid #111827', paddingBottom: '1px', letterSpacing: '0.025em' }}>{fmtQuotePrice(breakouts.baseBid)}</span>
                          </span>
                          {taxCategory && taxCategory !== 'resale' && taxCategory !== 'noTax' && totals.totalTax > 0 && (
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 ml-2 tracking-wide">TAX INCLUDED</span>
                          )}
                        </p>
                      </div>
                      
                      {breakouts.deducts.length > 0 && (
                        <div className="mb-4 p-3 border border-red-300 bg-red-50 dark:bg-red-950">
                          <p className="font-semibold text-sm mb-2 text-red-800">DEDUCT OPTIONS:</p>
                          {breakouts.deducts.map(d => (
                            <p key={d.id} className="text-sm mb-1 flex justify-between">
                              <span>If {d.name || 'this scope'} is removed from Berger Iron's scope, please deduct from the base bid.</span>
                              <span className="font-bold ml-2">{fmtQuotePrice(d.total)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      
                      {breakouts.adds.length > 0 && (
                        <div className="mb-4 p-3 border border-green-300 bg-green-50 dark:bg-green-950">
                          <p className="font-semibold text-sm mb-2 text-green-800">ADD OPTIONS:</p>
                          {breakouts.adds.map(a => (
                            <p key={a.id} className="text-sm mb-1 flex justify-between">
                              <span>If Berger Iron is to provide the additional {a.name || 'scope'}, please add to the base bid.</span>
                              <span className="font-bold ml-2">{fmtQuotePrice(a.total)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Qualifications */}
                <div className="mb-6">
                  <h3 className="font-semibold text-sm border-b border-gray-400 dark:border-gray-500 pb-1 mb-2">QUALIFICATIONS:</h3>
                  <ul className="text-xs space-y-1">
                    {[...selectedQualifications, ...customQualifications].map((qual, i) => (
                      <li key={i}>- {qual}</li>
                    ))}
                  </ul>
                </div>

                {/* Exclusions */}
                <div className="mb-8">
                  <h3 className="font-semibold text-sm border-b border-gray-400 dark:border-gray-500 pb-1 mb-2">EXCLUSIONS:</h3>
                  <ul className="text-xs space-y-1">
                    {[...selectedExclusions, ...customExclusions].map((exc, i) => (
                      <li key={i}>- {exc}</li>
                    ))}
                  </ul>
                </div>

                {/* Signature Section */}
                <div className="mt-8 pt-4 border-t border-gray-400 dark:border-gray-500">
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-sm mb-1">Respectfully submitted,</p>
                      <div className="mt-8 border-b border-gray-800 w-48"></div>
                      <p className="text-sm mt-1">{estimatedBy || 'Estimator'}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Date: {estimateDate ? new Date(estimateDate).toLocaleDateString() : '_______________'}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="flex items-end gap-2 mb-6">
                        <span className="text-sm whitespace-nowrap">Accepted By:</span>
                        <div className="border-b border-gray-800 w-48"></div>
                      </div>
                      <div className="flex items-end gap-2 mb-6">
                        <span className="text-sm whitespace-nowrap">Authorized Signature:</span>
                        <div className="border-b border-gray-800 w-48"></div>
                      </div>
                      <div className="flex items-end gap-2">
                        <span className="text-sm whitespace-nowrap">Date:</span>
                        <div className="border-b border-gray-800 w-48"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-4 border-t border-gray-300 dark:border-gray-600 text-center text-xs text-gray-500 dark:text-gray-400">
                  <p>All agreements contingent upon Fires, Strikes, Embargoes, or all other causes beyond our control.</p>
                </div>
              </div>

              {/* Print Button */}
              <div className="no-print mt-6 text-center">
                <button 
                  onClick={() => window.print()}
                  className="bg-gray-700 dark:bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-800"
                >
                  Print Quote
                </button>
              </div>
            </div>
          )}

      {/* Import Preview Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="bg-green-700 text-white p-4 rounded-t-lg flex justify-between items-center">
              <h3 className="text-lg font-bold">Import from Revu CSV</h3>
              <button onClick={cancelImport} className="text-white hover:text-gray-300 text-2xl">&times;</button>
            </div>
            
            <div className="p-6 space-y-4">
              {importError && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 rounded p-4 flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-semibold text-red-800">Import Error</p>
                    <p className="text-red-700 text-sm">{importError}</p>
                  </div>
                </div>
              )}
              
              {importPreview && (
                <>
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 rounded p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="text-green-600" size={20} />
                      <span className="font-semibold text-green-800">Ready to Import</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div><span className="text-gray-600 dark:text-gray-400">Items:</span> <span className="font-semibold">{importPreview.items.length}</span></div>
                      <div><span className="text-gray-600 dark:text-gray-400">Material Lines:</span> <span className="font-semibold">{importPreview.items.reduce((sum, item) => sum + item.materials.length, 0)}</span></div>
                      <div><span className="text-gray-600 dark:text-gray-400">Total Pieces:</span> <span className="font-semibold">{importPreview.items.reduce((sum, item) => sum + item.materials.reduce((msum, mat) => msum + mat.pieces, 0), 0)}</span></div>
                    </div>
                  </div>

                  {importPreview.unmatchedSizes.length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 rounded p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
                        <div>
                          <p className="font-semibold text-yellow-800">
                            Unmatched Sizes — {importPreview.unmatchedSizes.reduce((n, u) => n + u.rowCount, 0)} row(s) will import with ZERO weight
                          </p>
                          <p className="text-yellow-700 text-sm mb-2">These sizes could not be matched to the AISC database and will be imported as Custom with 0 lbs/ft — weight and cost will be zero until corrected:</p>
                          <ul className="space-y-1">
                            {importPreview.unmatchedSizes.map((u, i) => (
                              <li key={i} className="text-xs text-yellow-800">
                                <span className="bg-yellow-100 px-2 py-0.5 rounded font-mono">{u.size}</span>
                                <span className="text-yellow-700"> — {u.rowCount} row(s): {u.locations.join(', ')}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                          <th className="p-2 text-left">Item #</th>
                          <th className="p-2 text-left">Description</th>
                          <th className="p-2 text-left">Drawing Ref</th>
                          <th className="p-2 text-right">Materials</th>
                          <th className="p-2 text-right">Total Pcs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.items.slice(0, 10).map((item, i) => (
                          <tr key={i} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="p-2 font-mono">{item.itemNumber}</td>
                            <td className="p-2">{item.itemName}</td>
                            <td className="p-2 text-gray-600 dark:text-gray-400">{item.drawingRef || '-'}</td>
                            <td className="p-2 text-right">{item.materials.length}</td>
                            <td className="p-2 text-right font-semibold">{item.materials.reduce((sum, mat) => sum + mat.pieces, 0)}</td>
                          </tr>
                        ))}
                        {importPreview.items.length > 10 && (
                          <tr className="border-t bg-gray-50 dark:bg-gray-800">
                            <td colSpan={5} className="p-2 text-center text-gray-600 dark:text-gray-400">... and {importPreview.items.length - 10} more items</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded p-4 text-sm">
                    <p className="font-semibold text-blue-800 mb-1">Merge Behavior:</p>
                    <ul className="text-blue-700 space-y-1">
                      <li>- Matching material lines: Quantity will be replaced</li>
                      <li>- New material lines: Will be added to existing items</li>
                      <li>- New items: Will be created</li>
                      <li>- Existing fabrication and pricing: Will be preserved</li>
                      <li>- Drawing references: Will be appended</li>
                    </ul>
                  </div>
                </>
              )}
            </div>

            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end gap-2">
              <button onClick={cancelImport} className="px-4 py-2 border rounded hover:bg-gray-200">Cancel</button>
              {importPreview && (
                <button onClick={executeImport} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                  Import {importPreview.items.length} Items
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Takeoff Import Modal (Neilsoft 19-column) */}
      {showTakeoffModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="bg-blue-700 text-white p-4 rounded-t-lg flex justify-between items-center">
              <h3 className="text-lg font-bold">Import Takeoff CSV</h3>
              <button onClick={cancelTakeoffImport} className="text-white hover:text-gray-300 text-2xl">&times;</button>
            </div>

            <div className="p-6 space-y-4">
              {takeoffError && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 rounded p-4 flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-semibold text-red-800">Import Error</p>
                    <p className="text-red-700 text-sm">{takeoffError}</p>
                  </div>
                </div>
              )}

              {takeoffPreview && (
                <>
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Check className="text-blue-600" size={20} />
                      <span className="font-semibold text-blue-800">Ready to Import</span>
                    </div>
                    <div className="flex gap-8 text-sm">
                      <div><span className="text-gray-600 dark:text-gray-400">Items:</span> <span className="font-bold text-blue-800">{takeoffPreview.stats.totalItems}</span></div>
                      <div><span className="text-gray-600 dark:text-gray-400">Members:</span> <span className="font-bold text-blue-800">{takeoffPreview.stats.totalMembers}</span></div>
                      <div><span className="text-gray-600 dark:text-gray-400">Fab Operations:</span> <span className="font-bold text-blue-800">{takeoffPreview.stats.totalFabOps}</span></div>
                    </div>
                  </div>

                  {(takeoffPreview.unmatchedSizes || []).length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-300 rounded p-4 text-sm">
                      <p className="font-semibold text-yellow-800 mb-1">
                        Unmatched Sizes — {takeoffPreview.unmatchedSizes.reduce((n, u) => n + u.rowCount, 0)} member(s) will import with ZERO weight
                      </p>
                      <p className="text-yellow-700 mb-2">These sizes could not be matched to the AISC database and will import as Custom with 0 lbs/ft — weight and cost will be zero until corrected:</p>
                      <ul className="space-y-1">
                        {takeoffPreview.unmatchedSizes.map((u, i) => (
                          <li key={i} className="text-xs text-yellow-800">
                            <span className="bg-yellow-100 px-2 py-0.5 rounded font-mono">{u.size}</span>
                            <span className="text-yellow-700"> — {u.rowCount} member(s): {u.locations.join(', ')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {takeoffPreview.items.some(i => i.coatingMixed) && (
                    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-300 rounded p-4 text-sm">
                      <p className="font-semibold text-yellow-800 mb-1">Mixed Coating Warning</p>
                      <p className="text-yellow-700 mb-2">The following items have rows with different or missing coating values. No item-level coating operation will be added — review manually:</p>
                      <ul className="list-disc list-inside text-yellow-700 space-y-0.5">
                        {takeoffPreview.items.filter(i => i.coatingMixed).map(i => (
                          <li key={i.itemNumber}>
                            Item {i.itemNumber} — {i.itemName}
                            {i.coatingMixedValues.length > 0 && (
                              <span className="text-yellow-600"> ({i.coatingMixedValues.join(', ')})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-700">
                          <th className="border p-2 text-left">Item #</th>
                          <th className="border p-2 text-left">Description</th>
                          <th className="border p-2 text-left">Drawing Ref</th>
                          <th className="border p-2 text-center">Members</th>
                          <th className="border p-2 text-center">Fab Ops</th>
                          <th className="border p-2 text-left">Coating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {takeoffPreview.items.slice(0, 10).map(item => {
                          const memberCount = item.members.reduce((n, m) => n + 1 + (m.children || []).length, 0);
                          const fabOpCount = item.members.reduce((n, m) =>
                            n + (m.fabrication || []).length +
                            (m.children || []).reduce((nc, c) => nc + (c.fabrication || []).length, 0), 0
                          );
                          return (
                            <tr key={item.itemNumber} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="border p-2 font-mono">{item.itemNumber}</td>
                              <td className="border p-2">{item.itemName}</td>
                              <td className="border p-2 text-gray-600 dark:text-gray-400">{item.drawingRef}</td>
                              <td className="border p-2 text-center">{memberCount}</td>
                              <td className="border p-2 text-center">{fabOpCount}</td>
                              <td className="border p-2 text-sm">
                                {item.coatingUniform
                                  ? <span className="text-green-700">{item.coatingUniform}</span>
                                  : item.coatingMixed
                                    ? <span className="text-yellow-600">Mixed</span>
                                    : <span className="text-gray-400">—</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                        {takeoffPreview.items.length > 10 && (
                          <tr>
                            <td colSpan={6} className="p-2 text-center text-gray-500 dark:text-gray-400">
                              ... and {takeoffPreview.items.length - 10} more items
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded p-4 text-sm">
                    <p className="font-semibold text-blue-800 mb-1">Import Behavior:</p>
                    <ul className="text-blue-700 space-y-1">
                      <li>- Each member mark becomes a material line (parents + children)</li>
                      <li>- Fabrication operations are populated per member</li>
                      <li>- Uniform coating becomes an item-level fabrication operation</li>
                      <li>- Mixed coatings are skipped — add manually after import</li>
                      <li>- Existing items: new materials appended, no duplicates added</li>
                      <li>- Existing pricing and fabrication rates are preserved</li>
                    </ul>
                  </div>
                </>
              )}
            </div>

            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end gap-2">
              <button onClick={cancelTakeoffImport} className="px-4 py-2 border rounded hover:bg-gray-200">Cancel</button>
              {takeoffPreview && (
                <button onClick={executeTakeoffImport} className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800">
                  Import {takeoffPreview.stats.totalItems} Items
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[100] cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Snapshot"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-6 text-white text-3xl font-bold hover:text-gray-300"
            onClick={() => setLightboxSrc(null)}
          >×</button>
        </div>
      )}

        </div>
      </div>
    </div>
  );
};

export default SteelEstimator;
