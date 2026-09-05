'use client';

// One drawing set: scope summary, jobs with live status and outputs, and the
// buttons to re-scope, measure, pass. docs/drawings-page-plan.md
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Download, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import AppHeader from '../../../components/AppHeader';
import { apiFetch } from '../../../lib/api-client';

const KIND_TITLE = {
  misc: 'Miscellaneous / ornamental', material: 'Material', connect: 'Connections & anchorage', finish: 'Finish & coating',
  exclude: 'Not ours (existing, other trades)', status: 'Document status', note: 'Scope notes', member: 'Steel members',
};
const KIND_ORDER = ['misc', 'material', 'connect', 'finish', 'exclude', 'status', 'note', 'member'];
const JOB_BADGE = {
  QUEUED: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300',
  RUNNING: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  DONE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400',
};

function when(v) {
  if (!v) return '';
  return new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ScopeSummary({ summary }) {
  if (!summary?.categories) return null;
  const cats = Object.entries(summary.categories);
  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 dark:text-zinc-400">
        {summary.pages} pages · {summary.structural_sheets} structural sheets scanned · plans: {summary.plans?.length ? summary.plans.join(', ') : 'none found'}
        {summary.document_status?.length ? <> · <span className="text-red-600 dark:text-red-400">{summary.document_status.join('; ')}</span></> : null}
      </div>
      {summary.title_block?.lines?.length ? (
        <div className="text-sm"><span className="text-gray-500">Title block:</span> {summary.title_block.lines.slice(0, 6).join(' · ')}</div>
      ) : null}
      {KIND_ORDER.map(kind => {
        const rows = cats.filter(([, v]) => v.kind === kind);
        if (!rows.length) return null;
        return (
          <div key={kind}>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-500 mb-1">{KIND_TITLE[kind]}</div>
            <ul className="text-sm space-y-0.5">
              {rows.map(([cat, v]) => (
                <li key={cat}>
                  <span className="font-medium">{cat}</span>
                  <span className="text-gray-500"> · {v.mentions} on {v.sheets.slice(0, 6).join(', ')}{v.sheets.length > 6 ? '…' : ''}</span>
                  {v.examples?.length ? <span className="text-gray-500 dark:text-zinc-500"> · e.g. {v.examples.slice(0, 2).join('; ')}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {summary.sizes?.length ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-500 mb-1">Shape callouts (label count, not pieces)</div>
          <table className="text-sm">
            <tbody>
              {summary.sizes.slice(0, 20).map(s => (
                <tr key={s.size}><td className="pr-4 py-0.5">{s.size}</td><td className="pr-4 text-right tabular-nums">{s.callouts}</td><td className="text-gray-500">{s.lbft != null ? `${s.lbft} lb/ft` : 'not in table'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {summary.sheets?.length ? (
        <details>
          <summary className="text-sm cursor-pointer text-gray-600 dark:text-zinc-400">Sheets scanned ({summary.sheets.length})</summary>
          <table className="text-xs mt-1">
            <thead><tr className="text-gray-500"><th className="pr-3 text-left">Page</th><th className="pr-3 text-left">Sheet</th><th className="pr-3 text-left">Kind</th><th className="pr-3 text-left">Title</th><th className="pr-3 text-left">Read</th></tr></thead>
            <tbody>{summary.sheets.map(s => <tr key={s.page}><td className="pr-3">{s.page}</td><td className="pr-3">{s.sheet}</td><td className="pr-3">{s.kind}</td><td className="pr-3">{s.title}</td><td className="pr-3">{s.read}</td></tr>)}</tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

function JobRow({ set, job, canManage, onChange }) {
  const [open, setOpen] = useState(false);
  const active = job.status === 'QUEUED' || job.status === 'RUNNING';
  const cancel = async () => {
    try { await apiFetch(`/api/drawings/${set.id}/jobs/${job.id}`, { method: 'DELETE' }); onChange(); } catch { /* shown on reload */ }
  };
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <button onClick={() => setOpen(o => !o)} className="text-gray-500">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <span className="font-medium">{job.kind === 'SCOPE' ? 'Scope' : 'Measure'}</span>
        <span className={`text-xs rounded px-1.5 py-0.5 ${JOB_BADGE[job.status] || ''}`}>{job.status.toLowerCase()}</span>
        {active && job.progress && <span className="text-xs text-gray-500">{job.progress}</span>}
        {active && <Loader2 className="animate-spin text-sky-500" size={14} />}
        <span className="text-xs text-gray-500">{job.requestedBy?.firstName} {job.requestedBy?.lastName} · {when(job.createdAt)}{job.finishedAt ? ` → ${when(job.finishedAt)}` : ''}</span>
        {job.kind === 'MEASURE' && job.options?.lengths && <span className="text-xs text-gray-500">with lengths</span>}
        <span className="flex-1" />
        {job.outputs?.map(o => (
          <a key={o.name} href={`/api/drawings/${set.id}/files/${encodeURIComponent(o.name)}?job=${job.id}`} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800"><Download size={12} />{o.name}</a>
        ))}
        {active && canManage && <button onClick={cancel} className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1"><XCircle size={12} />Cancel</button>}
      </div>
      {open && (
        <pre className="mt-2 max-h-72 overflow-auto text-xs bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded p-2 whitespace-pre-wrap">{job.log || '(no output yet)'}</pre>
      )}
    </div>
  );
}

export default function DrawingSetPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const [set, setSet] = useState(null);
  const [err, setErr] = useState('');
  const [lengths, setLengths] = useState(true);

  const load = useCallback(async () => {
    try { setSet(await apiFetch(`/api/drawings/${id}`)); setErr(''); } catch (e) { setErr(e.message || 'Could not load'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const active = set?.jobs?.some(j => j.status === 'QUEUED' || j.status === 'RUNNING');
    if (!active) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [set, load]);

  const canManage = session?.user && (session.user.role === 'ADMIN' || session.user.role === 'ESTIMATOR');
  const runJob = async (kind, extra = {}) => {
    try {
      await apiFetch(`/api/drawings/${id}/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, options: { lengths, ...extra } }) });
      load();
    } catch (e) { setErr(e.message); }
  };
  const pass = async (p) => {
    try { await apiFetch(`/api/drawings/${id}/pass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: p }) }); load(); } catch (e) { setErr(e.message); }
  };

  const scopeJob = set?.jobs?.find(j => j.kind === 'SCOPE' && j.status === 'DONE');
  const busy = set?.jobs?.some(j => j.status === 'QUEUED' || j.status === 'RUNNING');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <AppHeader />
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="text-sm"><a href="/drawings" className="text-sky-600 hover:underline">← Drawings</a></div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        {!set ? <div className="text-sm text-gray-500"><Loader2 className="inline animate-spin mr-1" size={14} />Loading…</div> : (
          <>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-semibold">{set.name}</h1>
                <div className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                  <a href={`/api/drawings/${set.id}/files/original.pdf`} className="hover:underline">{set.originalName}</a>
                  {set.pageCount ? ` · ${set.pageCount} pages` : ''} · uploaded by {set.uploadedBy?.firstName} {set.uploadedBy?.lastName}, {when(set.createdAt)}
                  {set.project && <> · project <a href={`/?projectId=${set.project.id}`} className="text-sky-600 hover:underline">{set.project.projectName || `#${set.project.id}`}</a></>}
                  {set.prospectStatus === 'PASS' && <> · <span className="text-gray-500">passed</span></>}
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <label className="inline-flex items-center gap-1"><input type="checkbox" checked={lengths} onChange={e => setLengths(e.target.checked)} /> lengths</label>
                  <button disabled={busy} onClick={() => runJob('MEASURE')} className="px-2.5 py-1 rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50">Measure</button>
                  <button disabled={busy} onClick={() => runJob('SCOPE')} className="px-2.5 py-1 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50" title="Architectural + structural sheets">Re-scope</button>
                  <button disabled={busy} onClick={() => runJob('SCOPE', { allSheets: true })} className="px-2.5 py-1 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50" title="Every discipline, slower">Re-scope entire set</button>
                  {!set.projectId && (set.prospectStatus !== 'PASS'
                    ? <button onClick={() => pass(true)} className="px-2.5 py-1 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800">Pass</button>
                    : <button onClick={() => pass(false)} className="px-2.5 py-1 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800">Restore</button>)}
                </div>
              )}
            </div>

            <section className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-medium">Scope</h2>
                {scopeJob && <a href={`/api/drawings/${set.id}/files/scope.pdf?job=${scopeJob.id}`} className="text-sm px-2.5 py-1 rounded bg-sky-600 text-white hover:bg-sky-700">Open scope PDF in Revu</a>}
              </div>
              {scopeJob ? <ScopeSummary summary={scopeJob.summary} /> : <div className="text-sm text-gray-500">{busy ? 'Scoping…' : 'No scope run has finished yet.'}</div>}
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <h2 className="font-medium p-4 pb-2">Jobs</h2>
              <div className="divide-y divide-gray-200 dark:divide-zinc-800">
                {set.jobs.length === 0 && <div className="p-4 text-sm text-gray-500">No jobs yet.</div>}
                {set.jobs.map(j => <JobRow key={j.id} set={set} job={j} canManage={canManage} onChange={load} />)}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
