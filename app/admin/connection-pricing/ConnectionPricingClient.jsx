'use client';

import { useState, useEffect, useTransition } from 'react';
import AppHeader from '../../../components/AppHeader';
import {
  updatePricingRates,
  updateConnectionCategory,
  getBeamBySize,
  updateBeamOverride,
  createCustomOp,
  updateCustomOp,
  deleteCustomOp,
  getTemplateItems,
  linkTemplateItem,
  previewTemplateSync,
  applyTemplateSync,
  updateGalvClass,
  updateGalvMinimum,
} from './actions';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(val) {
  if (val == null) return '—';
  return `$${Number(val).toFixed(2)}`;
}

function ProvideTO() {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 whitespace-nowrap">
      Provide T/O
    </span>
  );
}

// ─── Section 1: Rate Drivers ───────────────────────────────────────────────────

function RatesEditor({ rates }) {
  const [laborRate, setLaborRate] = useState(rates?.shopLaborRatePerHr ?? 65);
  const [materialRate, setMaterialRate] = useState(rates?.materialAvgPricePerLb ?? 0.789);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updatePricingRates({
        shopLaborRatePerHr: parseFloat(laborRate),
        materialAvgPricePerLb: parseFloat(materialRate),
        quantityDiscountOver20Pct: rates?.quantityDiscountOver20Pct ?? 5,
        quantityDiscountOver100Pct: rates?.quantityDiscountOver100Pct ?? 7.5,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert('Failed to save rates: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Shop Labor Rate ($/hr)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={laborRate}
              onChange={e => setLaborRate(e.target.value)}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">/hr</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Material Avg Price ($/lb)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400 text-sm">$</span>
            <input
              type="number"
              step="0.001"
              min="0"
              value={materialRate}
              onChange={e => setMaterialRate(e.target.value)}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">/lb</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save & Recalculate'}
        </button>
        {saved && <span className="text-green-600 text-sm">✓ Saved</span>}
      </div>

      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm text-gray-600 dark:text-gray-400">
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity Discount Rules (read-only)</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Over 20 pieces: −{rates?.quantityDiscountOver20Pct ?? 5}%</li>
          <li>Over 100 pieces: −{rates?.quantityDiscountOver100Pct ?? 7.5}%</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Galvanizing rate classes ──────────────────────────────────────────────────
// One row per galvanizer class (codes match the AZZ sheet). Rate is Berger's
// ALL-IN $/cwt — environmental fee, handling on/off the truck, etc. baked in.
// The estimator prices a galv line at rate / 100 per lb and groups galv lines
// by class.
function GalvClassesEditor({ initialClasses, initialMinimum }) {
  const [classes, setClasses] = useState(initialClasses || []);
  const [editing, setEditing] = useState({}); // id → string value
  const [minimum, setMinimum] = useState(initialMinimum ?? 325);
  const [minSaved, setMinSaved] = useState(false);
  const [, startTransition] = useTransition();

  const saveRate = (cls) => {
    const val = editing[cls.id];
    if (val === undefined) return;
    const ratePerCwt = val === '' ? 0 : parseFloat(val);
    if (!Number.isFinite(ratePerCwt)) return;
    startTransition(async () => {
      try {
        await updateGalvClass(cls.id, { ratePerCwt });
        setClasses(prev => prev.map(c => c.id === cls.id ? { ...c, ratePerCwt } : c));
        setEditing(prev => { const n = { ...prev }; delete n[cls.id]; return n; });
      } catch (e) {
        alert('Save failed: ' + e.message);
      }
    });
  };

  const toggleActive = (cls) => {
    const active = !cls.active;
    startTransition(async () => {
      try {
        await updateGalvClass(cls.id, { active });
        setClasses(prev => prev.map(c => c.id === cls.id ? { ...c, active } : c));
      } catch (e) {
        alert('Update failed: ' + e.message);
      }
    });
  };

  const saveMinimum = () => {
    startTransition(async () => {
      try {
        await updateGalvMinimum(parseFloat(minimum) || 0);
        setMinSaved(true);
        setTimeout(() => setMinSaved(false), 3000);
      } catch (e) {
        alert('Save failed: ' + e.message);
      }
    });
  };

  const inputCls = 'w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-right dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 w-20">Code</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Class</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300">All-in rate ($/cwt)</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300">$/lb</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Active</th>
            </tr>
          </thead>
          <tbody>
            {classes.map(cls => (
              <tr key={cls.id} className={`border-b border-gray-100 dark:border-gray-700 ${cls.active ? '' : 'opacity-50'}`}>
                <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{cls.code}</td>
                <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200">{cls.name}</td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    type="number" step="0.01" min="0"
                    value={editing[cls.id] ?? cls.ratePerCwt}
                    onChange={e => setEditing(prev => ({ ...prev, [cls.id]: e.target.value }))}
                    onBlur={() => saveRate(cls)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className={inputCls}
                  />
                </td>
                <td className="px-3 py-1.5 text-right text-gray-500 dark:text-gray-400 tabular-nums">
                  {((editing[cls.id] !== undefined ? parseFloat(editing[cls.id]) || 0 : cls.ratePerCwt) / 100).toFixed(4)}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input type="checkbox" checked={!!cls.active} onChange={() => toggleActive(cls)} className="rounded" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Minimum charge per lot</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400 text-sm">$</span>
            <input type="number" step="1" min="0" value={minimum} onChange={e => setMinimum(e.target.value)}
              className="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={saveMinimum} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">Save</button>
            {minSaved && <span className="text-green-600 text-sm">✓ Saved</span>}
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xl">
          Default class per assembly: under 20 lb dipped → MLT; pipe by nominal diameter and tube by largest side
          → the FPIP / FTUB tiers; W, WT, C, MC, L → KDS; plate, flats, bar, custom → MSC. Change it on the
          galv line or the group in the estimate. Rates take effect on new galv lines and on groups you re-class.
        </p>
      </div>
    </div>
  );
}

// ─── Section 2 & 3: Category Table ────────────────────────────────────────────

function CategoryTable({ categories, shapeType, shopLaborRate = 65, onLinkTemplate }) {
  const [editing, setEditing] = useState({}); // id → field → value
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);

  const startEdit = (id, field, currentVal) => {
    setEditing(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: currentVal ?? '' },
    }));
  };

  const handleChange = (id, field, val) => {
    setEditing(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: val },
    }));
  };

  const handleSave = async (id) => {
    const changes = editing[id];
    if (!changes) return;
    setSaving(id);
    try {
      const data = {};
      for (const [field, val] of Object.entries(changes)) {
        data[field] = val === '' || val === null ? null : parseFloat(val);
      }
      await updateConnectionCategory(id, data);
      setSaved(id);
      setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(null);
    }
  };

  const cancelEdit = (id) => {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // For WF categories, connxCost is null — computed as laborHours × shopLaborRate
  const getComputedConnxCost = (cat, isMoment) => {
    const stored = isMoment ? cat.momentConnxCost : cat.connxCost;
    if (stored != null) return null; // has explicit value, no computed needed
    if (cat.providesTakeoffCost) return null; // "Provide T/O"
    const hrs = cat.laborHours;
    if (hrs == null) return null;
    return parseFloat((hrs * shopLaborRate).toFixed(2));
  };

  const EditableCell = ({ id, field, value, provideTO = false, computedVal = null }) => {
    const isEditing = editing[id] && field in editing[id];
    if (provideTO) return <ProvideTO />;
    if (isEditing) {
      return (
        <input
          type="number"
          step="0.01"
          className="w-20 px-1 py-0.5 border border-blue-400 rounded text-xs dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
          value={editing[id][field]}
          onChange={e => handleChange(id, field, e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(id); if (e.key === 'Escape') cancelEdit(id); }}
          autoFocus
        />
      );
    }
    // Show computed value (from laborHours × shopRate) when no explicit value is stored
    if (value == null && computedVal != null) {
      return (
        <span
          className="cursor-pointer px-1 rounded text-gray-400 dark:text-gray-500 italic"
          onClick={() => startEdit(id, field, computedVal)}
          title={`Computed: labor hrs × $${shopLaborRate}/hr. Click to set override.`}
        >
          {fmt(computedVal)}
        </span>
      );
    }
    return (
      <span
        className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 px-1 rounded"
        onClick={() => startEdit(id, field, value)}
        title="Click to edit"
      >
        {fmt(value)}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Category</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Shapes</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Labor Hrs</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Connx Wt</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Bolted $</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Welded $</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Moment/CJP $</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Single Cope</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Straight Cut</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Miter Cut</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {categories.map(cat => {
            const hasEdits = !!editing[cat.id];
            const isSaving = saving === cat.id;
            const wasSaved = saved === cat.id;
            return (
              <tr
                key={cat.id}
                className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{cat.name}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{cat.shapesIncluded}</td>
                <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{cat.laborHours.toFixed(4)}</td>
                <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{cat.connxWeightLbs} lbs</td>
                <td className="px-3 py-2 text-right">
                  <TemplateCostCell cat={cat} kind="bolted" editing={editing} startEdit={startEdit} handleChange={handleChange} handleSave={handleSave} cancelEdit={cancelEdit} onLinkTemplate={onLinkTemplate} />
                </td>
                <td className="px-3 py-2 text-right">
                  <TemplateCostCell cat={cat} kind="welded" editing={editing} startEdit={startEdit} handleChange={handleChange} handleSave={handleSave} cancelEdit={cancelEdit} onLinkTemplate={onLinkTemplate} />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell id={cat.id} field="momentConnxCost" value={cat.momentConnxCost} provideTO={cat.providesTakeoffCost} computedVal={getComputedConnxCost(cat, true)} />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell id={cat.id} field="singleCopeCost" value={cat.singleCopeCost} />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell id={cat.id} field="straightCutCost" value={cat.straightCutCost} />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell id={cat.id} field="miterCutCost" value={cat.miterCutCost} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {hasEdits && (
                    <span className="flex gap-1">
                      <button
                        onClick={() => handleSave(cat.id)}
                        disabled={isSaving}
                        className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSaving ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => cancelEdit(cat.id)}
                        className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {wasSaved && <span className="text-green-600 text-xs">✓</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Click any cost cell to edit inline. Press Enter to save or Esc to cancel.</p>
    </div>
  );
}

// ─── Section 4: Beam Lookup ────────────────────────────────────────────────────

function BeamSearchEditor() {
  const [query, setQuery] = useState('');
  const [beam, setBeam] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setBeam(null);
    setNotFound(false);
    setOverrides({});
    try {
      const result = await getBeamBySize(query);
      if (result) {
        setBeam(result);
      } else {
        setNotFound(true);
      }
    } catch (e) {
      alert('Search failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOverrideSave = async () => {
    if (!beam || Object.keys(overrides).length === 0) return;
    setSaving(true);
    setSaved(false);
    try {
      const data = {};
      for (const [field, val] of Object.entries(overrides)) {
        data[field] = val === '' ? null : parseFloat(val);
      }
      await updateBeamOverride(beam.beamSize, data);
      setBeam(prev => ({ ...prev, ...data }));
      setOverrides({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'connxCost', label: 'Connx $', provideTO: beam?.connxCostProvideTO },
    { key: 'momentConnxCost', label: 'Moment $', provideTO: beam?.momentConnxCostProvideTO },
    { key: 'singleCopeCost', label: 'Single Cope' },
    { key: 'doubleCopeCost', label: 'Double Cope' },
    { key: 'straightCutCost', label: 'Straight Cut' },
    { key: 'miterCutCost', label: 'Miter Cut' },
    { key: 'doubleMiterCost', label: 'Double Miter' },
    { key: 'singleCopeMiterCost', label: 'Single Cope + Miter' },
    { key: 'doubleCopeMiterCost', label: 'Double Cope + Miter' },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="e.g. W21X44 or C12X20.7"
          className="w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {notFound && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          No beam found for "{query.toUpperCase()}". Check the size format (e.g. W21X44).
        </p>
      )}

      {beam && (
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{beam.beamSize}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Category: {beam.category.name} · Connx Weight: {beam.connxWeightLbs} lbs · Moment Connx Weight: {beam.momentConnxWeightLbs} lbs
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fields.map(({ key, label, provideTO }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                {provideTO ? (
                  <ProvideTO />
                ) : beam[key] == null ? (
                  <span className="text-xs text-gray-400 dark:text-gray-500 italic">N/A for this shape</span>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={overrides[key] ?? beam[key]}
                      onChange={e => setOverrides(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {Object.keys(overrides).length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleOverrideSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Overrides'}
              </button>
              {saved && <span className="text-green-600 text-sm">✓ Saved</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section 5: Operation Rates ───────────────────────────────────────────────

const OP_RATE_GROUPS = [
  {
    label: 'Drilling ($/hole)',
    fields: [
      { key: 'drillHolesRate',  label: 'Drill Holes' },
      { key: 'drillCSinkRate',  label: 'Drill & C\'sink' },
      { key: 'drillTapRate',   label: 'Drill & Tap' },
    ],
  },
  {
    label: 'Prep Operations ($/ea)',
    fields: [
      { key: 'easeRate',    label: 'Ease' },
      { key: 'spliceRate',  label: 'Splice' },
      { key: 'ninetyRate',  label: '90\'s' },
      { key: 'camberRate',  label: 'Camber' },
      { key: 'rollRate',    label: 'Roll' },
    ],
  },
  {
    label: 'Apply ($/in of weld)',
    fields: [
      { key: 'weldFilletRate', label: 'Fillet Weld' },
      { key: 'weldBevelRate',  label: 'Bevel/Weld/Grind' },
      { key: 'weldPjpRate',   label: 'PJP Weld' },
      { key: 'weldCjpRate',   label: 'CJP Weld' },
      { key: 'preheatWeldRate',      label: 'Preheat/Weld' },
      { key: 'preheatWeldGrindRate', label: 'Preheat/Weld/Grind' },
    ],
  },
];

const OP_RATE_KEYS = OP_RATE_GROUPS.flatMap(g => g.fields.map(f => f.key));

function OpRatesEditor({ rates }) {
  const initial = {};
  for (const key of OP_RATE_KEYS) {
    initial[key] = rates?.[key] ?? '';
  }
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const data = {};
      for (const key of OP_RATE_KEYS) {
        const v = values[key];
        data[key] = v === '' || v == null ? null : parseFloat(v);
      }
      await updatePricingRates(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {OP_RATE_GROUPS.map(group => (
        <div key={group.label}>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{group.label}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {group.fields.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 dark:text-gray-400 text-xs">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="—"
                    value={values[key]}
                    onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Operation Rates'}
        </button>
        {saved && <span className="text-green-600 text-sm">✓ Saved</span>}
      </div>
    </div>
  );
}

// ─── Section 6: Custom Fab Operations ─────────────────────────────────────────

const CATEGORY_OPTIONS = ['Cutting', 'Drilling', 'Prep', 'Apply', 'Coating', 'Finishing', 'Handling', 'Other'];
const UNIT_OPTIONS = ['EA', 'IN', 'LF', 'SQFT', 'HR', 'LB', 'LS'];

function CustomOpsEditor({ initialOps }) {
  const [ops, setOps] = useState(initialOps || []);
  const [editingRate, setEditingRate] = useState({}); // id → string value
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Other');
  const [newUnit, setNewUnit] = useState('EA');
  const [newRate, setNewRate] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) { setAddError('Name is required.'); return; }
    setAdding(true);
    setAddError('');
    try {
      const created = await createCustomOp({
        name: trimmed,
        category: newCategory,
        defaultUnit: newUnit,
        rate: parseFloat(newRate) || 0,
      });
      setOps(prev => [...prev, created].sort((a, b) =>
        a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
      ));
      setNewName('');
      setNewRate('');
    } catch (e) {
      if (e.message?.includes('Unique') || e.message?.includes('unique')) {
        setAddError(`"${trimmed}" already exists.`);
      } else {
        setAddError('Failed to add: ' + e.message);
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRateSave = async (op) => {
    const val = editingRate[op.id];
    if (val === undefined) return;
    const rate = val === '' ? 0 : parseFloat(val);
    startTransition(async () => {
      try {
        await updateCustomOp(op.id, { rate });
        setOps(prev => prev.map(o => o.id === op.id ? { ...o, rate } : o));
        setEditingRate(prev => { const n = { ...prev }; delete n[op.id]; return n; });
      } catch (e) {
        alert('Save failed: ' + e.message);
      }
    });
  };

  const handleToggleActive = async (op) => {
    const active = !op.active;
    startTransition(async () => {
      try {
        await updateCustomOp(op.id, { active });
        setOps(prev => prev.map(o => o.id === op.id ? { ...o, active } : o));
      } catch (e) {
        alert('Update failed: ' + e.message);
      }
    });
  };

  const handleDelete = async (op) => {
    if (!confirm(`Delete "${op.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteCustomOp(op.id);
        setOps(prev => prev.filter(o => o.id !== op.id));
      } catch (e) {
        alert('Delete failed: ' + e.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Existing ops table */}
      {ops.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">No custom operations defined yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Name</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Category</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Unit</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Rate</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Active</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {ops.map(op => {
                const isEditingRate = op.id in editingRate;
                return (
                  <tr key={op.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{op.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{op.category}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{op.defaultUnit}</td>
                    <td className="px-3 py-2 text-right">
                      {isEditingRate ? (
                        <input
                          type="number"
                          step="0.01"
                          className="w-20 px-1 py-0.5 border border-blue-400 rounded text-xs dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
                          value={editingRate[op.id]}
                          onChange={e => setEditingRate(prev => ({ ...prev, [op.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRateSave(op);
                            if (e.key === 'Escape') setEditingRate(prev => { const n = { ...prev }; delete n[op.id]; return n; });
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 px-1 rounded"
                          onClick={() => setEditingRate(prev => ({ ...prev, [op.id]: op.rate ?? '' }))}
                          title="Click to edit"
                        >
                          {fmt(op.rate)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleToggleActive(op)}
                        className={`px-2 py-0.5 rounded text-xs font-medium ${op.active ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                        title={op.active ? 'Click to deactivate' : 'Click to activate'}
                      >
                        {op.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleDelete(op)}
                        className="text-red-500 hover:text-red-700 text-xs"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Click any rate cell to edit inline. Press Enter to save or Esc to cancel.</p>
        </div>
      )}

      {/* Add new operation form */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Add Operation</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => { setNewName(e.target.value); setAddError(''); }}
              placeholder="e.g. Sandblast"
              className="w-40 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Unit</label>
            <select
              value={newUnit}
              onChange={e => setNewUnit(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Rate ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newRate}
              onChange={e => setNewRate(e.target.value)}
              placeholder="0.00"
              className="w-24 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add Operation'}
          </button>
        </div>
        {addError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{addError}</p>}
      </div>
    </div>
  );
}

// ─── Bolted/Welded cost cell (editable + template link) ───────────────────────

function TemplateCostCell({ cat, kind, editing, startEdit, handleChange, handleSave, cancelEdit, onLinkTemplate }) {
  const field = kind === 'bolted' ? 'boltedConnxCost' : 'weldedConnxCost';
  const linkedId = cat[`${kind}TemplateItemId`];
  const syncedAt = cat[`${kind}SyncedAt`];
  const value = cat[field];
  const isEditing = editing[cat.id] && field in editing[cat.id];
  return (
    <div className="flex flex-col items-end gap-0.5">
      {isEditing ? (
        <input
          type="number"
          step="0.01"
          autoFocus
          className="w-20 px-1 py-0.5 border border-blue-400 rounded text-xs dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
          value={editing[cat.id][field]}
          onChange={e => handleChange(cat.id, field, e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(cat.id); if (e.key === 'Escape') cancelEdit(cat.id); }}
        />
      ) : (
        <span
          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 px-1 rounded"
          onClick={() => startEdit(cat.id, field, value)}
          title={syncedAt
            ? `Synced from Connx Template ${new Date(syncedAt).toLocaleDateString()}. Click to override manually.`
            : 'Click to edit'}
        >
          {fmt(value)}
        </span>
      )}
      <button
        onClick={() => onLinkTemplate?.(cat, kind)}
        className={`text-[10px] leading-none px-1 rounded ${linkedId
          ? 'text-blue-600 dark:text-blue-400 hover:underline'
          : 'text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:underline'}`}
        title={linkedId
          ? 'Linked to a Connx Template item — click to change or unlink'
          : 'Link a Connx Template item so sync prices this cell'}
      >
        {linkedId ? 'linked ✓' : 'link…'}
      </button>
    </div>
  );
}

// ─── Template link picker modal ────────────────────────────────────────────────

function TemplateLinkPicker({ target, onClose }) {
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(target.cat[`${target.kind}TemplateItemId`] ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getTemplateItems()
      .then(setItems)
      .catch(e => setError(e.message));
  }, []);

  const save = async (itemId) => {
    setSaving(true);
    setError(null);
    try {
      await linkTemplateItem(target.cat.id, target.kind, itemId);
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Link template item — {target.cat.name} · {target.kind === 'bolted' ? 'Bolted' : 'Welded'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            The linked item's shop total (materials + fab, no recap) becomes this cell's price on sync. Build each template item as ONE connection.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>}
          {!items && !error && <p className="text-sm text-gray-500 dark:text-gray-400">Loading template items…</p>}
          {items && items.length === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No template items found. Create a project flagged as a template (e.g. "Connx Template") with one item per connection scenario.
            </p>
          )}
          {items && items.map(it => (
            <label key={it.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm">
              <input
                type="radio"
                name="templateItem"
                checked={selected === it.id}
                onChange={() => setSelected(it.id)}
              />
              <span className="flex-1 text-gray-800 dark:text-gray-200">
                {it.itemNumber} — {it.itemName}
                <span className="text-gray-400 dark:text-gray-500"> · {it.projectName}</span>
              </span>
              <span className="text-gray-600 dark:text-gray-400 tabular-nums">{fmt(it.total)}</span>
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between gap-2">
          <button
            onClick={() => save(null)}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
          >
            Unlink
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline">Cancel</button>
            <button
              onClick={() => save(selected)}
              disabled={saving || selected == null}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Linking…' : 'Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Template sync panel ───────────────────────────────────────────────────────

function TemplateSyncPanel() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [includeInReview, setIncludeInReview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const loadPreview = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setPreview(await previewTemplateSync());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      const r = await applyTemplateSync({ includeInReview });
      setResult(r);
      setPreview(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  };

  const changedRows = preview?.rows?.filter(r => r.bolted?.changed || r.welded?.changed) ?? [];

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={loadPreview}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Reading template…' : 'Preview Sync'}
        </button>
        {result && (
          <span className="text-sm text-green-600 dark:text-green-400">
            ✓ {result.categoriesUpdated} categor{result.categoriesUpdated === 1 ? 'y' : 'ies'} updated · {result.updatedRows} estimate line{result.updatedRows === 1 ? '' : 's'} repriced across {result.projectsTouched} project{result.projectsTouched === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {preview && (
        <div className="mt-4 space-y-4">
          {preview.rows.length === 0 ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No categories are linked to template items yet. Use the "link…" control under a Bolted/Welded cell below.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700">
                      <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Category</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Column</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Template item</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Current</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.flatMap(r => ['bolted', 'welded'].filter(k => r[k]).map(k => (
                      <tr key={`${r.categoryId}-${k}`} className={`border-t border-gray-100 dark:border-gray-700 ${r[k].changed ? '' : 'opacity-50'}`}>
                        <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200 whitespace-nowrap">{r.name}</td>
                        <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 capitalize">{k}</td>
                        <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{r[k].itemName}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmt(r[k].current)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${r[k].changed ? 'text-blue-700 dark:text-blue-400' : 'text-gray-500'}`}>{fmt(r[k].next)}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p>
                  Repricing on apply: <strong>{preview.affected.DRAFT.rows}</strong> line{preview.affected.DRAFT.rows === 1 ? '' : 's'} in {preview.affected.DRAFT.projects} draft project{preview.affected.DRAFT.projects === 1 ? '' : 's'}, <strong>{preview.affected.REOPENED.rows}</strong> in {preview.affected.REOPENED.projects} reopened. Published projects are never touched.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={includeInReview} onChange={e => setIncludeInReview(e.target.checked)} className="rounded" />
                  <span>Also reprice in-review projects ({preview.affected.IN_REVIEW.rows} line{preview.affected.IN_REVIEW.rows === 1 ? '' : 's'} in {preview.affected.IN_REVIEW.projects} project{preview.affected.IN_REVIEW.projects === 1 ? '' : 's'})</span>
                </label>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Repriced lines take their new totals immediately; project roll-ups refresh when a project is next opened or saved. Grouped fab lines keep their labor-group rate.
                </p>
              </div>
              <button
                onClick={apply}
                disabled={applying || changedRows.length === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {applying ? 'Applying…' : `Apply Sync (${changedRows.length} categor${changedRows.length === 1 ? 'y' : 'ies'} changed)`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page layout ──────────────────────────────────────────────────────────

export default function ConnectionPricingClient({ rates, wfCategories, cCategories, customOps, galvClasses }) {
  const [linkTarget, setLinkTarget] = useState(null); // { cat, kind } | null
  const openLinkPicker = (cat, kind) => setLinkTarget({ cat, kind });
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      {linkTarget && <TemplateLinkPicker target={linkTarget} onClose={() => setLinkTarget(null)} />}
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Global Pricing Data</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Shop labor rates, material pricing, operation rates, and connection cost lookup tables.
          </p>
        </div>

        {/* Section 1: Rate Drivers */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Rate Drivers</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            These two values drive all connection cost calculations. Update when shop rate or material pricing changes.
          </p>
          <RatesEditor rates={rates} />
        </section>

        {/* Section 2: Operation Rates */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Operation Rates</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Per-unit rates for drilling, prep, and welding operations. These are applied automatically when a fab op is added to an estimate.
          </p>
          <OpRatesEditor rates={rates} />
        </section>

        {/* Section 2.5: Galvanizing */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Galvanizing</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Galvanizer rate classes (codes match the AZZ Houston sheet in docs/galv-rate-sheet.pdf). Enter Berger's
            all-in $/cwt per class — the estimator prices each dipped assembly at its class rate and groups galv lines by class.
          </p>
          <GalvClassesEditor initialClasses={galvClasses} initialMinimum={rates?.galvMinimumCharge} />
        </section>

        {/* Section 3: Custom Fab Operations */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Custom Fab Operations</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Define arbitrary operations (e.g. "Sandblast") that appear in the estimator's fab ops dropdown with a default rate and unit. No code changes required.
          </p>
          <CustomOpsEditor initialOps={customOps} />
        </section>

        {/* Section 3.5: Connx Template Sync */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Connx Template Sync</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Bolted/Welded prices come from the "Connx Template" project — each linked item is one connection taken off line by line, and its shop total is the all-in per-each price. Preview shows old → new before anything is applied.
          </p>
          <TemplateSyncPanel />
        </section>

        {/* Section 4: WF Categories */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            W-Shape Connection Categories
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            13 categories covering W4–W44. W44 and W40 costs are "Provide Takeoff" — entered manually per project.
          </p>
          <CategoryTable categories={wfCategories} shapeType="WF" shopLaborRate={rates?.shopLaborRatePerHr ?? 65} onLinkTemplate={openLinkPicker} />
        </section>

        {/* Section 5: C/MC Categories */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            C/MC Channel Connection Categories
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            6 categories covering C3–C15 and MC3–MC18.
          </p>
          <CategoryTable categories={cCategories} shapeType="C" shopLaborRate={rates?.shopLaborRatePerHr ?? 65} onLinkTemplate={openLinkPicker} />
        </section>

        {/* Section 6: Beam Lookup */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Beam Size Lookup &amp; Override
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Search for a specific beam size (e.g. "W21X44") to view or override its individual costs.
            Most beams inherit from their category — only set overrides when a specific size differs.
          </p>
          <BeamSearchEditor />
        </section>
      </div>
    </div>
  );
}
