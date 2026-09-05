// Drawing sets: upload (POST) and list (GET).
//
// POST streams the request body straight to disk (sets are 30-375 MB), so the
// client sends the raw PDF as the body with the file name in X-File-Name.
// A SCOPE job is queued as soon as the file is stored.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import path from 'path';
import fs from 'fs/promises';
import { authOptions } from '../../../lib/auth';
import prisma from '../../../lib/db';
import { canManageDrawings } from '../../../lib/drawings/access';
import { displayName, drawingsDir, looksLikePdf, safeJoin, setDir, streamToFile } from '../../../lib/drawings/storage';
import { enqueue } from '../../../lib/drawings/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIST_INCLUDE = {
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
  project: { select: { id: true, projectName: true, status: true } },
  jobs: { orderBy: { createdAt: 'desc' }, take: 1,
    select: { id: true, kind: true, status: true, progress: true, summary: true, createdAt: true, finishedAt: true } },
};

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const where = projectId
    ? { projectId: parseInt(projectId, 10) }
    : { projectId: null, prospectStatus: searchParams.get('passed') ? 'PASS' : { not: 'PASS' } };
  if (!projectId && !canManageDrawings(user)) {
    return NextResponse.json({ error: 'Prospects are for estimators' }, { status: 403 });
  }
  const sets = await prisma.drawingSet.findMany({ where, include: LIST_INCLUDE, orderBy: { createdAt: 'desc' } });
  if (projectId && !canManageDrawings(user)) {
    const visible = sets.filter(s => s.project?.status === 'PUBLISHED');
    return NextResponse.json(visible.map(shape));
  }
  return NextResponse.json(sets.map(shape));
}

function shape(set) {
  const job = set.jobs?.[0] || null;
  let summary = null;
  if (job?.summary) { try { summary = JSON.parse(job.summary); } catch { summary = null; } }
  return { ...set, titleBlock: safeParse(set.titleBlock, {}), latestJob: job ? { ...job, summary } : null, jobs: undefined };
}

function safeParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageDrawings(user)) return NextResponse.json({ error: 'Only estimators can upload drawings' }, { status: 403 });
  const rawName = request.headers.get('x-file-name') || 'drawings.pdf';
  const originalName = path.basename(decodeURIComponent(rawName)).slice(0, 200);
  if (!/\.pdf$/i.test(originalName)) return NextResponse.json({ error: 'Drop a PDF drawing set' }, { status: 400 });
  if (!request.body) return NextResponse.json({ error: 'Empty upload' }, { status: 400 });

  const set = await prisma.drawingSet.create({
    data: { name: displayName(originalName), originalName, storagePath: '', uploadedById: parseInt(user.id, 10) },
  });
  const dest = safeJoin(setDir(set.id), 'original.pdf');
  try {
    const { bytes, sha256 } = await streamToFile(request.body, dest);
    if (!bytes || !(await looksLikePdf(dest))) {
      await fs.rm(setDir(set.id), { recursive: true, force: true });
      await prisma.drawingSet.delete({ where: { id: set.id } });
      return NextResponse.json({ error: 'That file is not a PDF' }, { status: 400 });
    }
    const duplicate = await prisma.drawingSet.findFirst({ where: { sha256, id: { not: set.id } }, select: { id: true, name: true } });
    const updated = await prisma.drawingSet.update({
      where: { id: set.id },
      data: { storagePath: path.relative(drawingsDir(), dest), sizeBytes: bytes, sha256 },
      include: LIST_INCLUDE,
    });
    const job = await enqueue({ setId: set.id, kind: 'SCOPE', options: {}, userId: parseInt(user.id, 10) });
    return NextResponse.json({ ...shape(updated), latestJob: job, duplicateOf: duplicate }, { status: 201 });
  } catch (err) {
    await fs.rm(setDir(set.id), { recursive: true, force: true }).catch(() => {});
    await prisma.drawingSet.delete({ where: { id: set.id } }).catch(() => {});
    console.error('[drawings] upload failed', err);
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 });
  }
}
