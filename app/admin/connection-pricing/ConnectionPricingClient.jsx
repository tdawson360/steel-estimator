'use client';

import { useState, useTransition } from 'react';
import AppHeader from '../../../components/AppHeader';
import {
  updatePricingRates,
  updateConnectionCategory,
  getBeamBySize,
  updateBeamOverride,
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

// ─── Section 2 & 3: Category Table ────────────────────────────────────────────

function CategoryTable({ categories, shapeType }) {
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

  const EditableCell = ({ id, field, value, provideTO = false }) => {
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
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Connx $</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Moment $</th>
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
                  <EditableCell id={cat.id} field="connxCost" value={cat.connxCost} provideTO={cat.providesTakeoffCost} />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell id={cat.id} field="momentConnxCost" value={cat.momentConnxCost} provideTO={cat.providesTakeoffCost} />
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

// ─── Main page layout ──────────────────────────────────────────────────────────

export default function ConnectionPricingClient({ rates, wfCategories, cCategories }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Connection Pricing Data</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Shop labor rates, material pricing, and connection cost lookup tables.
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

        {/* Section 2: WF Categories */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            W-Shape Connection Categories
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            13 categories covering W4–W44. W44 and W40 costs are "Provide Takeoff" — entered manually per project.
          </p>
          <CategoryTable categories={wfCategories} shapeType="WF" />
        </section>

        {/* Section 3: C/MC Categories */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            C/MC Channel Connection Categories
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            6 categories covering C3–C15 and MC3–MC18.
          </p>
          <CategoryTable categories={cCategories} shapeType="C" />
        </section>

        {/* Section 4: Beam Lookup */}
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
