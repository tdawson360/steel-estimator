// Drawing job runner: one worker inside the Next.js server that runs the
// Python sidecar (sidecar/) for SCOPE and MEASURE jobs, one at a time.
//
// Why in-process and single: the sidecar is CPU-bound and, until the office
// server exists, this machine is also the estimating PC. Jobs are persisted
// in DrawingJob so nothing is lost on a restart; recoverOnBoot() re-queues
// anything left RUNNING. State lives on globalThis so dev-mode module reloads
// don't start a second worker.
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import prisma from '../db';
import { REPO_ROOT, drawingsDir, jobDir, listOutputs, safeJoin, setDir } from './storage';

const LOG_CAP = 64 * 1024;
const PROGRESS_FLUSH_MS = 1500;

const state = globalThis.__drawingsRunner || (globalThis.__drawingsRunner = { current: null, child: null, ticking: false });

export function pythonCmd() {
  return process.env.SIDECAR_PYTHON || 'python';
}

export async function enqueue({ setId, kind, options = {}, userId }) {
  const job = await prisma.drawingJob.create({
    data: { setId, kind, options: JSON.stringify(options), requestedById: userId },
  });
  kick();
  return job;
}

export function kick() {
  if (!state.current) tick().catch(err => console.error('[drawings] tick failed', err));
}

async function tick() {
  if (state.current || state.ticking) return;
  state.ticking = true;
  try {
    const job = await prisma.drawingJob.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      include: { set: true },
    });
    if (!job) return;
    state.current = job.id;
    await prisma.drawingJob.update({ where: { id: job.id }, data: { status: 'RUNNING', startedAt: new Date(), log: '' } });
    run(job).catch(err => console.error('[drawings] job crashed', err)).finally(() => {
      state.current = null;
      state.child = null;
      kick();
    });
  } finally {
    state.ticking = false;
  }
}

function sidecarArgs(job, input, outDir) {
  const opts = JSON.parse(job.options || '{}');
  if (job.kind === 'SCOPE') {
    const args = [path.join('sidecar', 'scope.py'), input, '-o', path.join(outDir, 'scope.pdf'),
      '--json', path.join(outDir, 'summary.json')];
    if (opts.ocr === 'off') args.push('--ocr', 'off');
    if (opts.allSheets) args.push('--all-sheets');
    return args;
  }
  const args = [path.join('sidecar', 'auto_takeoff.py'), input, '-o', path.join(outDir, 'takeoff.pdf'),
    '--json', path.join(outDir, 'summary.json'), '--ocr', opts.ocr === 'off' ? 'off' : 'auto'];
  if (opts.lengths) args.push('--lengths');
  if (opts.sheets) args.push('--sheets', String(opts.sheets));
  return args;
}

async function run(job) {
  const outDir = jobDir(job.setId, job.id);
  await fs.mkdir(outDir, { recursive: true });
  const input = safeJoin(drawingsDir(), job.set.storagePath);
  const args = sidecarArgs(job, input, outDir);

  let log = '';
  let progress = '';
  let lastFlush = 0;
  const append = (chunk) => {
    log += chunk;
    if (log.length > LOG_CAP) log = log.slice(-LOG_CAP);
    for (const line of chunk.split(/\r?\n/)) {
      if (line.startsWith('PROGRESS ')) progress = line.slice(9).trim();
    }
    const now = Date.now();
    if (now - lastFlush > PROGRESS_FLUSH_MS) {
      lastFlush = now;
      prisma.drawingJob.update({ where: { id: job.id }, data: { progress, log } }).catch(() => {});
    }
  };

  const code = await new Promise((resolve) => {
    let child;
    try {
      child = spawn(pythonCmd(), args, {
        cwd: REPO_ROOT,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      });
    } catch (err) {
      append(`spawn failed: ${err.message}\n`);
      return resolve(-1);
    }
    state.child = child;
    try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not fatal */ }
    child.stdout.on('data', d => append(d.toString('utf8')));
    child.stderr.on('data', d => append(d.toString('utf8')));
    child.on('error', err => { append(`spawn error: ${err.message}\n`); resolve(-1); });
    child.on('close', resolve);
  });

  const outputs = await listOutputs(job.setId, job.id);
  let summary = null;
  try { summary = JSON.parse(await fs.readFile(path.join(outDir, 'summary.json'), 'utf8')); } catch { /* none */ }
  const cancelled = (await prisma.drawingJob.findUnique({ where: { id: job.id }, select: { status: true } }))?.status === 'CANCELLED';
  const status = cancelled ? 'CANCELLED' : (code === 0 && summary ? 'DONE' : 'FAILED');
  if (!cancelled && status === 'FAILED' && !log.trim()) log = `sidecar exited with code ${code} and no output`;
  await prisma.drawingJob.update({
    where: { id: job.id },
    data: { status, progress, log, outputs: JSON.stringify(outputs), summary: JSON.stringify(summary || {}), finishedAt: new Date() },
  });
  if (status === 'DONE' && job.kind === 'SCOPE') {
    const set = await prisma.drawingSet.findUnique({ where: { id: job.setId } });
    const data = {
      pageCount: summary.pages || set.pageCount,
      titleBlock: JSON.stringify(summary.title_block || {}),
    };
    if (set.prospectStatus === 'NEW') data.prospectStatus = 'SCOPED';
    await prisma.drawingSet.update({ where: { id: job.setId }, data });
  }
}

export async function cancel(jobId) {
  const job = await prisma.drawingJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (job.status === 'QUEUED') {
    return prisma.drawingJob.update({ where: { id: jobId }, data: { status: 'CANCELLED', finishedAt: new Date() } });
  }
  if (job.status === 'RUNNING' && state.current === jobId && state.child) {
    await prisma.drawingJob.update({ where: { id: jobId }, data: { status: 'CANCELLED' } });
    try { state.child.kill(); } catch { /* already gone */ }
    return prisma.drawingJob.findUnique({ where: { id: jobId } });
  }
  return job;
}

// Called once at server start: jobs the previous process left RUNNING go back
// in the queue, then the worker starts.
export async function recoverOnBoot() {
  await prisma.drawingJob.updateMany({ where: { status: 'RUNNING' }, data: { status: 'QUEUED', progress: '' } });
  kick();
}

// Is the sidecar runnable on this machine? Reports the pieces so a missing
// install shows on the page, not as a failed job.
export function health() {
  const probe = 'import sys, json\n'
    + 'out = {"python": sys.version.split()[0]}\n'
    + 'for m in ("pymupdf", "cv2", "rapidocr", "numpy"):\n'
    + '    try:\n'
    + '        mod = __import__(m); out[m] = getattr(mod, "__version__", "ok")\n'
    + '    except Exception as e:\n'
    + '        out[m] = None\n'
    + 'print(json.dumps(out))\n';
  return new Promise((resolve) => {
    let out = '', err = '';
    let child;
    try {
      child = spawn(pythonCmd(), ['-c', probe], { cwd: REPO_ROOT, windowsHide: true });
    } catch (e) {
      return resolve({ ok: false, error: e.message, python: null });
    }
    const timer = setTimeout(() => { try { child.kill(); } catch { /* */ } }, 20000);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(timer); resolve({ ok: false, error: e.message, python: null }); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const info = JSON.parse(out.trim().split('\n').pop());
        resolve({ ok: !!info.pymupdf, ...info, running: state.current, command: pythonCmd() });
      } catch {
        resolve({ ok: false, error: (err || out || 'no output').slice(-500), python: null, command: pythonCmd() });
      }
    });
  });
}

export function runnerState() {
  return { current: state.current };
}
