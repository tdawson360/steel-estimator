'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';

export default function CustomerSearchInput({ value, customerId, onChange }) {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // Sync input value when prop changes (e.g., on project load)
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
        setShowNewForm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.length < 1) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}`);
      if (res.ok) setSuggestions(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const handleInputChange = (val) => {
    setInputValue(val);
    setShowDropdown(true);
    setShowNewForm(false);

    // Also pass through as plain text (no customer linked yet)
    onChange(val, null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250);
  };

  const handleSelect = (customer) => {
    setInputValue(customer.name);
    onChange(customer.name, customer.id);
    setShowDropdown(false);
    setSuggestions([]);
  };

  const handleClear = () => {
    setInputValue('');
    onChange('', null);
    setSuggestions([]);
  };

  const handleCreateNew = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const customer = await res.json();
        setInputValue(customer.name);
        onChange(customer.name, customer.id);
        setShowNewForm(false);
        setShowDropdown(false);
        setNewName('');
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex items-center">
        <input
          type="text"
          value={inputValue}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => { if (inputValue) fetchSuggestions(inputValue); setShowDropdown(true); }}
          placeholder="Search or type customer name..."
          className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 pr-8"
        />
        {(inputValue || customerId) && (
          <button onClick={handleClear} className="absolute right-2 text-gray-400 hover:text-gray-600" type="button">
            <X size={14} />
          </button>
        )}
      </div>

      {customerId && (
        <div className="mt-1 text-xs text-green-600 dark:text-green-400">
          Linked to customer #{customerId}
        </div>
      )}

      {showDropdown && inputValue && !showNewForm && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.length > 0 ? suggestions.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(c)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0"
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
              {c.totalProjects > 0 && (
                <span className="ml-2 text-xs text-gray-400">{c.totalProjects} project{c.totalProjects !== 1 ? 's' : ''}</span>
              )}
            </button>
          )) : (
            <div className="px-3 py-2 text-sm text-gray-400">No matches found</div>
          )}
          <button
            type="button"
            onClick={() => { setShowNewForm(true); setNewName(inputValue); }}
            className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors flex items-center gap-1 font-medium"
          >
            <Plus size={14} /> Create &quot;{inputValue}&quot; as new customer
          </button>
        </div>
      )}

      {showNewForm && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Create new customer:</p>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full p-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 mb-2"
            placeholder="Customer name"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowNewForm(false)}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">Cancel</button>
            <button type="button" onClick={handleCreateNew} disabled={creating}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {creating ? <Loader2 size={12} className="animate-spin" /> : 'Create'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
