'use client';

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  Pencil, Copy, Archive, Loader2, Plus,
} from 'lucide-react';
import AppHeader from '../../components/AppHeader';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const DASHBOARD_STATUSES = [
  'Bidding',
  'Quoted - Pending Award from GC',
  'Quoted - Budget Only',
  'Awarded to BIW',
  'Redesign omitted scope',
];

const STATUS_BADGE = {
  'Bidding':                        'bg-blue-100 text-blue-700',
  'Quoted - Pending Award from GC': 'bg-yellow-100 text-yellow-800',
  'Quoted - Budget Only':           'bg-purple-100 text-purple-700',
  'Awarded to BIW':                 'bg-green-100 text-green-700',
  'Redesign omitted scope':         'bg-gray-100 text-gray-600',
};

const SORT_COLS = ['name', 'estimator', 'bidDate', 'status', 'bidAmount', 'newOrCo'];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function estimatorName(project) {
  if (!project.estimator) return '';
  return `${project.estimator.firstName || ''} ${project.estimator.lastName || ''}`.trim();
}

function formatDate(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatTime(value) {
  if (!value) return '';
  try {
    const [h, m] = value.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
  } catch {
    return value;
  }
}

function formatCurrency(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

// ── SORT HEADER ───────────────────────────────────────────────────────────────

function SortHeader({ col, label, sortCol, sortDir, onSort, className = '' }) {
  const active = sortCol === col;
  return (
    <th
      className={`px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (
          sortDir === 'asc'
            ? <ChevronUp size={14} className="text-blue-600" />
            : <ChevronDown size={14} className="text-blue-600" />
        ) : (
          <ChevronsUpDown size={14} className="text-gray-300" />
        )}
      </span>
    </th>
  );
}

// ── MAIN DASHBOARD CONTENT ────────────────────────────────────────────────────

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read filter/sort state from URL
  const statusFilter    = searchParams.get('status') || '';
  const estimatorFilter = searchParams.get('estimator') || '';
  const showArchived    = searchParams.get('archived') === '1';
  const sortCol         = searchParams.get('sort') || 'bidDate';
  const sortDir         = searchParams.get('dir') || 'desc';

  const [projects, setProjects]   = useState([]);
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null); // project id

  // ── FETCH DATA ─────────────────────────────────────────────────────────────

  const fetchProjects = useCallback(async (includeArchived) => {
    const qs = includeArchived ? '?includeArchived=1' : '';
    const res = await fetch(`/api/dashboard/projects${qs}`);
    if (res.ok) setProjects(await res.json());
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchProjects(showArchived),
      fetch('/api/dashboard/users').then(r => r.ok ? r.json() : []).then(setUsers),
    ]).finally(() => setLoading(false));
  }, [showArchived, fetchProjects]);

  // ── URL PARAM HELPERS ──────────────────────────────────────────────────────

  const updateParam = useCallback((key, value) => {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value); else p.delete(key);
    router.replace(`/dashboard?${p.toString()}`);
  }, [router, searchParams]);

  const handleSort = useCallback((col) => {
    const p = new URLSearchParams(searchParams.toString());
    if (sortCol === col) {
      p.set('dir', sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      p.set('sort', col);
      p.set('dir', col === 'bidDate' || col === 'bidAmount' ? 'desc' : 'asc');
    }
    router.replace(`/dashboard?${p.toString()}`);
  }, [router, searchParams, sortCol, sortDir]);

  // ── FILTER + SORT (client-side) ────────────────────────────────────────────

  const displayed = useMemo(() => {
    let r = projects.filter(p => {
      if (statusFilter    && p.dashboardStatus !== statusFilter)              return false;
      if (estimatorFilter && String(p.estimator?.id || '') !== estimatorFilter) return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    r = [...r].sort((a, b) => {
      switch (sortCol) {
        case 'name':
          return dir * (a.projectName || '').localeCompare(b.projectName || '');
        case 'estimator':
          return dir * estimatorName(a).localeCompare(estimatorName(b));
        case 'bidDate': {
          const da = a.bidDate ? new Date(a.bidDate).getTime() : 0;
          const db = b.bidDate ? new Date(b.bidDate).getTime() : 0;
          return dir * (da - db);
        }
        case 'status':
          return dir * (a.dashboardStatus || '').localeCompare(b.dashboardStatus || '');
        case 'bidAmount':
          return dir * ((a.bidAmount || 0) - (b.bidAmount || 0));
        case 'newOrCo':
          return dir * (a.newOrCo || '').localeCompare(b.newOrCo || '');
        default:
          return 0;
      }
    });

    return r;
  }, [projects, statusFilter, estimatorFilter, sortCol, sortDir]);

  // ── ACTIONS ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/projects', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create project');
      const project = await res.json();
      window.location.href = `/?projectId=${project.id}`;
    } catch {
      alert('Failed to create project. Please try again.');
      setCreating(false);
    }
  };

  const handleEdit = (id) => {
    window.location.href = `/?projectId=${id}`;
  };

  const handleDuplicate = async (project) => {
    if (!confirm(`Duplicate "${project.projectName || 'this project'}"? A full copy of all estimate data will be created.`)) return;
    setActionInProgress(project.id);
    try {
      const res = await fetch(`/api/dashboard/projects/${project.id}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('Duplicate failed');
      const { id } = await res.json();
      window.location.href = `/?projectId=${id}`;
    } catch (err) {
      alert('Failed to duplicate project. Please try again.');
      setActionInProgress(null);
    }
  };

  const handleStatusChange = async (projectId, newStatus) => {
    // Optimistic update
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, dashboardStatus: newStatus || null } : p));
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardStatus: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
    } catch {
      // Revert on failure
      fetchProjects(showArchived);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleArchive = async (project) => {
    if (!confirm(`Archive "${project.projectName || 'this project'}"? It will be hidden from the dashboard. You can view it with "Show Archived".`)) return;
    setActionInProgress(project.id);
    try {
      const res = await fetch(`/api/dashboard/projects/${project.id}/archive`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Archive failed');
      // Remove from list (or re-fetch if showing archived)
      if (!showArchived) {
        setProjects(prev => prev.filter(p => p.id !== project.id));
      } else {
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, isArchived: true } : p));
      }
    } catch {
      alert('Failed to archive project. Please try again.');
    } finally {
      setActionInProgress(null);
    }
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────

  const sortProps = { sortCol, sortDir, onSort: handleSort };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bid Board</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {loading ? 'Loading...' : `${displayed.length} project${displayed.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {creating ? 'Creating...' : 'New Project'}
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Status</label>
            <select
              value={statusFilter}
              onChange={e => updateParam('status', e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All Statuses</option>
              {DASHBOARD_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Estimator filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Estimator</label>
            <select
              value={estimatorFilter}
              onChange={e => updateParam('estimator', e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All Estimators</option>
              {users.map(u => (
                <option key={u.id} value={String(u.id)}>
                  {`${u.firstName || ''} ${u.lastName || ''}`.trim() || `User ${u.id}`}
                </option>
              ))}
            </select>
          </div>

          {/* Show archived toggle */}
          <label className="flex items-center gap-2 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => updateParam('archived', e.target.checked ? '1' : '')}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Show Archived</span>
          </label>

          {/* Clear filters */}
          {(statusFilter || estimatorFilter) && (
            <button
              onClick={() => {
                const p = new URLSearchParams(searchParams.toString());
                p.delete('status');
                p.delete('estimator');
                router.replace(`/dashboard?${p.toString()}`);
              }}
              className="text-xs text-blue-600 hover:underline whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">Loading projects...</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            {statusFilter || estimatorFilter
              ? 'No projects match the current filters.'
              : showArchived
                ? 'No archived projects.'
                : 'No projects yet.'}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <SortHeader col="name"       label="Name"       {...sortProps} />
                  <SortHeader col="estimator"  label="Estimator"  {...sortProps} />
                  <SortHeader col="bidDate"    label="Bid Date"   {...sortProps} />
                  <SortHeader col="status"     label="Status"     {...sortProps} />
                  <SortHeader col="bidAmount"  label="Bid Amount" {...sortProps} className="text-right" />
                  <SortHeader col="newOrCo"    label="New / C.O." {...sortProps} />
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(project => {
                  const busy = actionInProgress === project.id;
                  return (
                    <tr
                      key={project.id}
                      className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${project.isArchived ? 'opacity-60' : ''}`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <a
                          href={`/?projectId=${project.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {project.projectName || 'Untitled Project'}
                        </a>
                        {project.isArchived && (
                          <span className="ml-2 text-xs text-gray-400 italic">archived</span>
                        )}
                      </td>

                      {/* Estimator */}
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {estimatorName(project) || (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Bid Date + Time */}
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(project.bidDate)}
                        {project.bidTime ? (
                          <span className="ml-1 text-gray-500 dark:text-gray-400">
                            {formatTime(project.bidTime)}
                          </span>
                        ) : null}
                      </td>

                      {/* Status dropdown */}
                      <td className="px-4 py-2">
                        <select
                          value={project.dashboardStatus || ''}
                          onChange={e => handleStatusChange(project.id, e.target.value)}
                          className={`text-xs font-medium rounded px-2 py-0.5 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                            project.dashboardStatus
                              ? STATUS_BADGE[project.dashboardStatus] || 'bg-gray-100 text-gray-600'
                              : 'bg-transparent text-gray-400'
                          }`}
                        >
                          <option value="">— None —</option>
                          {DASHBOARD_STATUSES.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>

                      {/* Bid Amount */}
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(project.bidAmount)}
                      </td>

                      {/* New / C.O. */}
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {project.newOrCo === 'NEW_PROJECT' ? 'New Project'
                          : project.newOrCo === 'CHANGE_ORDER' ? 'Change Order'
                          : <span className="text-gray-400 italic">—</span>}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {busy ? (
                            <Loader2 size={16} className="animate-spin text-gray-400" />
                          ) : (
                            <>
                              <button
                                onClick={() => handleEdit(project.id)}
                                title="Open in Estimator"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => handleDuplicate(project)}
                                title="Duplicate (deep copy)"
                                className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              >
                                <Copy size={15} />
                              </button>
                              {!project.isArchived && (
                                <button
                                  onClick={() => handleArchive(project)}
                                  title="Archive"
                                  className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 rounded transition-colors"
                                >
                                  <Archive size={15} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PAGE EXPORT (Suspense required for useSearchParams in Next.js 14) ─────────

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="h-12 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700" />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
