// Upload the estimator's corrected copy of a MEASURE job's takeoff PDF and
// queue a COMPARE job that diffs it against the tool's output (the
// improvement loop: what was kept, edited, deleted, added).
// Streams the raw PDF body; X-File-Name carries the name.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import path from 'path';
import fs from 'fs/promises';
import { authOptions } from '../../../../../../../lib/auth';
import prisma from '../../../../../../../lib/db';
import { canManageDrawings } from '../../../../../../../lib/drawings/access';
import { enqueue } from '../../../../../../../lib/drawings/runner';
import { jobDir, safeJoin, streamToFile, looksLikePdf } from '../../../../../../../lib/drawings/storage';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageDrawings(user)) return NextResponse.json({ error: 'Only estimators can upload corrections' }, { status: 403 });
  const setId = parseInt(params.id, 10);
  const sourceJobId = parseInt(params.jobId, 10);
  const source = await prisma.drawingJob.findUnique({ where: { id: sourceJobId } });
  if (!source || source.setId !== setId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (source.kind !== 'MEASURE' || source.status !== 'DONE') {
    return NextResponse.json({ error: 'Corrections go on a finished Measure job' }, { status: 409 });
  }
  const rawName = request.headers.get('x-file-name') || 'corrected.pdf';
  const originalName = path.basename(decodeURIComponent(rawName)).slice(0, 200);
  if (!/\.pdf$/i.test(originalName)) return NextResponse.json({ error: 'Drop the corrected takeoff PDF' }, { status: 400 });
  if (!request.body) return NextResponse.json({ error: 'Empty upload' }, { status: 400 });

  // The COMPARE job owns the corrected file: it lives in that job's folder.
  const job = await enqueue({
    setId, kind: 'COMPARE',
    options: { sourceJobId, correctedName: originalName },
    userId: parseInt(user.id, 10),
  });
  const dest = safeJoin(jobDir(setId, job.id), 'corrected.pdf');
  try {
    const { bytes } = await streamToFile(request.body, dest);
    if (!bytes || !(await looksLikePdf(dest))) {
      await fs.rm(dest, { force: true });
      await prisma.drawingJob.update({ where: { id: job.id }, data: { status: 'FAILED', log: 'The upload was not a PDF', finishedAt: new Date() } });
      return NextResponse.json({ error: 'That file is not a PDF' }, { status: 400 });
    }
  } catch (err) {
    await prisma.drawingJob.update({ where: { id: job.id }, data: { status: 'FAILED', log: `Upload failed: ${err.message}`, finishedAt: new Date() } }).catch(() => {});
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 });
  }
  // The job was queued before the file existed; release it now that it does.
  await prisma.drawingJob.update({ where: { id: job.id }, data: { options: JSON.stringify({ sourceJobId, correctedName: originalName, ready: true }) } });
  const { kick } = await import('../../../../../../../lib/drawings/runner');
  kick();
  return NextResponse.json(job, { status: 201 });
}
