'use client';

// Drawings: drop a bid set, it gets scoped, and it waits in Prospects until an
// estimator chases it (phase 2) or passes on it. docs/drawings-page-plan.md
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Upload, Loader2, FileText, XCircle, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import AppHeader from '../../components/AppHeader';
import { apiFetch } from '../../lib/api-client';

const JOB_BADGE = {
  QUEUED: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300',
  RUNNING: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  DONE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400',
};

function fmtBytes(n) {
  if (!n) return '';
  if (n > 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

function when(v) {
  if (!v) return '';
  return new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ScopeChips({ summary }) {
  if (!summary || !summary.categories) return null;
  const cats = Object.entries(summary.categories);
  const misc = cats.filter(([, v]) => v.kind === 'misc' || v.kind === 'material').map(([k]) => k);
  const finish = cats.filter(([, v]) => v.kind === 'finish').map(([k]) => k);
  const chips = [
    summary.plans?.length ? `${summary.plans.length} plan${summary.plans.length === 1 ? '' : 's'}` : 'no framing plans found',
    summary.sizes?.length ? `${summary.sizes.reduce((a, s) => a + s.callouts, 0)} callouts, ${summary.sizes.length} sizes` : null,
    ...misc, ...finish,
    ...(summary.document_status || []).slice(0, 1),
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map((c, i) => (
        <span key={i} className="text-xs rounded px-1.5 py-0.5 bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300">{c}</span>
      ))}
    </div>
  );
}

function UploadZone({ onDone }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(null);      // { name, pct }
  const [error, setError] = useState('');
  const [allSheets, setAllSheets] = useState(false);
  const inputRef = useRef(null);

  const send = useCallback((file) => {
    if (!file) return;
    setError('');
    if (!/\.pdf$/i.test(file.name)) { setError('Drop a PDF drawing set.'); return; }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/drawings');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', 'application/pdf');
    if (allSheets) xhr.setRequestHeader('X-Scope-All', '1');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setBusy({ name: file.name, pct: Math.round(100 * e.loaded / e.total) }); };
    xhr.onload = () => {
      setBusy(null);
      if (xhr.status === 201) {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (body?.duplicateOf) setError(`Uploaded, but this looks identical to "${body.duplicateOf.name}".`);
        onDone(body);
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* ignore */ }
        setError(msg);
      }
    };
    xhr.onerror = () => { setBusy(null); setError('Upload failed: network error'); };
    setBusy({ name: file.name, pct: 0 });
    xhr.send(file);
  }, [onDone, allSheets]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files?.[0]); }}
      onClick={() => !busy && inputRef.current?.click()}
      className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${drag ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10' : 'border-gray-300 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500'}`}
      data-testid="drawings-dropzone"
    >
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { send(e.target.files?.[0]); e.target.value = ''; }} />
      {busy ? (
        <div>
          <Loader2 className="inline animate-spin mr-2" size={18} />
          Uploading {busy.name} — {busy.pct}%
          <div className="mt-2 h-1.5 w-full max-w-md mx-auto rounded bg-gray-200 dark:bg-zinc-800">
            <div className="h-1.5 rounded bg-sky-500" style={{ width: `${busy.pct}%` }} />
          </div>
        </div>
      ) : (
        <div className="text-gray-600 dark:text-zinc-400">
          <Upload className="inline mr-2" size={18} />
          Drop a bid set here (the full combined PDF, as received). Scoping starts on its own.
        </div>
      )}
      <label className="mt-3 inline-flex items-center gap-1 text-xs text-gray-500 dark:text-zinc-500 cursor-pointer" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={allSheets} onChange={(e) => setAllSheets(e.target.checked)} />
        review entire set (all disciplines; default is architectural + structural only)
      </label>
      {error && <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">{error}</div>}
    </div>
  );
}

export default function DrawingsPage() {
  const { data: session } = useSession();
  const [sets, setSets] = useState([]);
  const [showPassed, setShowPassed] = useState(false);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setSets(await apiFetch(`/api/drawings${showPassed ? '?passed=1' : ''}`));
      setErr('');
    } catch (e) {
      setErr(e.message || 'Could not load drawings');
    } finally {
      setLoading(false);
    }
  }, [showPassed]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiFetch('/api/drawings/health').then(setHealth).catch(() => setHealth({ ok: false, error: 'health check failed' })); }, []);
  // Poll while anything is queued or running
  useEffect(() => {
    const active = sets.some(s => ['QUEUED', 'RUNNING'].includes(s.latestJob?.status));
    if (!active) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [sets, load]);

  const pass = async (set, pass) => {
    try {
      await apiFetch(`/api/drawings/${set.id}/pass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass }) });
      load();
    } catch (e) { setErr(e.message); }
  };

  const canManage = session?.user && (session.user.role === 'ADMIN' || session.user.role === 'ESTIMATOR');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <AppHeader />
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Drawings</h1>
          <div className="flex items-center gap-3 text-sm">
            {health && (
              <span className={`inline-flex items-center gap-1 ${health.ok ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`} title={health.ok ? `python ${health.python}, pymupdf ${health.pymupdf}` : (health.error || 'Python sidecar not available')}>
                {health.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {health.ok ? 'sidecar ready' : 'sidecar not available'}
              </span>
            )}
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={showPassed} onChange={(e) => setShowPassed(e.target.checked)} /> show passed
            </label>
            <button onClick={load} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-800" title="Refresh"><RefreshCw size={14} /></button>
          </div>
        </div>

        {canManage && <UploadZone onDone={load} />}
        {health && !health.ok && (
          <div className="text-sm rounded border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-3">
            The Python sidecar is not runnable on this server ({health.error || 'pymupdf missing'}). Uploads will queue but not scope until it is installed:
            <code className="ml-1">pip install -r sidecar/requirements.txt</code>
          </div>
        )}
        {err && <div className="text-sm text-red-600">{err}</div>}

        <section>
          <h2 className="text-sm font-medium text-gray-600 dark:text-zinc-400 mb-2">{showPassed ? 'Passed' : 'Prospects'} ({sets.length})</h2>
          {loading ? <div className="text-sm text-gray-500"><Loader2 className="inline animate-spin mr-1" size={14} />Loading…</div> : (
            <div className="rounded-lg border border-gray-200 dark:border-zinc-800 divide-y divide-gray-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
              {sets.length === 0 && <div className="p-4 text-sm text-gray-500">Nothing here yet. Drop a set above.</div>}
              {sets.map(set => {
                const job = set.latestJob;
                return (
                  <div key={set.id} className="p-4 flex items-start gap-4" data-testid={`drawing-set-${set.id}`}>
                    <FileText className="mt-1 text-gray-400 shrink-0" size={20} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={`/drawings/${set.id}`} className="font-medium hover:underline truncate">{set.name}</a>
                        {job && <span className={`text-xs rounded px-1.5 py-0.5 ${JOB_BADGE[job.status] || ''}`}>{job.kind === 'SCOPE' ? 'scope' : 'measure'} {job.status.toLowerCase()}{job.status === 'RUNNING' && job.progress ? ` · ${job.progress}` : ''}</span>}
                        {set.prospectStatus === 'PASS' && <span className="text-xs rounded px-1.5 py-0.5 bg-gray-100 text-gray-500 dark:bg-zinc-800">passed</span>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                        {set.originalName} · {fmtBytes(set.sizeBytes)}{set.pageCount ? ` · ${set.pageCount} pages` : ''} · {set.uploadedBy?.firstName} {set.uploadedBy?.lastName}, {when(set.createdAt)}
                      </div>
                      {job?.status === 'DONE' && job.kind === 'SCOPE' && <ScopeChips summary={job.summary} />}
                      {job?.status === 'FAILED' && <div className="text-xs text-red-600 mt-1">Scope failed — open the set to see the log.</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-sm">
                      {job?.status === 'DONE' && job.kind === 'SCOPE' && (
                        <a href={`/api/drawings/${set.id}/files/scope.pdf?job=${job.id}`} className="px-2.5 py-1 rounded bg-sky-600 text-white hover:bg-sky-700">Scope PDF</a>
                      )}
                      <a href={`/drawings/${set.id}`} className="px-2.5 py-1 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800">Open</a>
                      {canManage && set.prospectStatus !== 'PASS' && (
                        <button onClick={() => pass(set, true)} className="px-2.5 py-1 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1" title="Not chasing this one"><XCircle size={14} />Pass</button>
                      )}
                      {canManage && set.prospectStatus === 'PASS' && (
                        <button onClick={() => pass(set, false)} className="px-2.5 py-1 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800">Restore</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
