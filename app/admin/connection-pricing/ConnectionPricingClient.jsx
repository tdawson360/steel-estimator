'use client';

import { useState, useTransition } from 'react';
import AppHeader from '../../../components/AppHeader';
import {
  updatePricingRates,
  updateConnectionCategory,
  getBeamBySize,
  updateBeamOverride,
  createCustomOp,
  updateCustomOp,
  deleteCustomOp,
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

function CategoryTable({ categories, shapeType, shopLaborRate = 65 }) {
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
                  <EditableCell id={cat.id} field="connxCost" value={cat.connxCost} provideTO={cat.providesTakeoffCost} computedVal={getComputedConnxCost(cat, false)} />
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
    label: 'Welding ($/in of weld)',
    fields: [
      { key: 'weldFilletRate', label: 'Fillet' },
      { key: 'weldBevelRate',  label: 'Bevel/Grind' },
      { key: 'weldPjpRate',   label: 'PJP' },
      { key: 'weldCjpRate',   label: 'CJP' },
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

const CATEGORY_OPTIONS = ['Cutting', 'Drilling', 'Prep', 'Welding', 'Coating', 'Finishing', 'Handling', 'Other'];
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

// ─── Main page layout ──────────────────────────────────────────────────────────

export default function ConnectionPricingClient({ rates, wfCategories, cCategories, customOps }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
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

        {/* Section 3: Custom Fab Operations */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Custom Fab Operations</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Define arbitrary operations (e.g. "Sandblast") that appear in the estimator's fab ops dropdown with a default rate and unit. No code changes required.
          </p>
          <CustomOpsEditor initialOps={customOps} />
        </section>

        {/* Section 4: WF Categories */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            W-Shape Connection Categories
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            13 categories covering W4–W44. W44 and W40 costs are "Provide Takeoff" — entered manually per project.
          </p>
          <CategoryTable categories={wfCategories} shapeType="WF" shopLaborRate={rates?.shopLaborRatePerHr ?? 65} />
        </section>

        {/* Section 5: C/MC Categories */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            C/MC Channel Connection Categories
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            6 categories covering C3–C15 and MC3–MC18.
          </p>
          <CategoryTable categories={cCategories} shapeType="C" shopLaborRate={rates?.shopLaborRatePerHr ?? 65} />
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
