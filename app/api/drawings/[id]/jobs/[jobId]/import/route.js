// The rows of a takeoff PDF as an import preview: the same payload as
// POST /api/import-csv, read straight from the Markups List of a finished
// MEASURE job's takeoff.pdf or a COMPARE job's corrected.pdf (the estimator's
// corrected copy). The estimator page then shows its usual import preview and
// merges additively, exactly as a CSV upload would.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import fs from 'fs/promises';
import path from 'path';
import { authOptions } from '../../../../../../../lib/auth';
import prisma from '../../../../../../../lib/db';
import { canManageDrawings } from '../../../../../../../lib/drawings/access';
import { runSidecar } from '../../../../../../../lib/drawings/runner';
import { jobDir, safeJoin } from '../../../../../../../lib/drawings/storage';
import { importTakeoffText } from '../../../../../../../lib/import-takeoff-server';

export const dynamic = 'force-dynamic';

const SOURCE_FILE = { MEASURE: 'takeoff.pdf', COMPARE: 'corrected.pdf' };

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageDrawings(user)) return NextResponse.json({ error: 'Only estimators can import a takeoff' }, { status: 403 });
  const setId = parseInt(params.id, 10);
  const jobId = parseInt(params.jobId, 10);
  const job = await prisma.drawingJob.findUnique({ where: { id: jobId } });
  if (!job || job.setId !== setId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const fileName = SOURCE_FILE[job.kind];
  if (!fileName || job.status !== 'DONE') {
    return NextResponse.json({ error: 'Import a finished Measure job or a corrected takeoff' }, { status: 409 });
  }
  const pdf = safeJoin(jobDir(setId, jobId), fileName);
  try { await fs.access(pdf); } catch { return NextResponse.json({ error: `${fileName} is missing for this job` }, { status: 404 }); }

  const { code, stdout, stderr } = await runSidecar([path.join('sidecar', 'markups_csv.py'), pdf]);
  if (code !== 0 || !stdout.trim()) {
    return NextResponse.json({ error: `Could not read the takeoff: ${(stderr || 'no output').trim().split('\n').pop().slice(0, 300)}` }, { status: 500 });
  }
  const result = await importTakeoffText(stdout);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 422 });
  const rows = Math.max(0, stdout.trim().split('\n').length - 1);
  return NextResponse.json({ ...result, source: { setId, jobId, kind: job.kind, file: fileName, rows } });
}
