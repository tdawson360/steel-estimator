// One drawing set with all its jobs (GET); delete a passed prospect's files (DELETE).
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import fs from 'fs/promises';
import { authOptions } from '../../../../lib/auth';
import prisma from '../../../../lib/db';
import { canManageDrawings, canViewDrawingSet } from '../../../../lib/drawings/access';
import { setDir } from '../../../../lib/drawings/storage';

export const dynamic = 'force-dynamic';

// Delete the PDF, every job and its outputs. The row stays as a stub
// (prospectStatus DELETED, sha256 kept) so the same file dropped again is
// recognised as one that was already passed on. Only passed prospects.
export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageDrawings(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = parseInt(params.id, 10);
  const set = await prisma.drawingSet.findUnique({ where: { id }, include: { jobs: { select: { id: true, status: true } } } });
  if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (set.projectId || set.prospectStatus !== 'PASS') {
    return NextResponse.json({ error: 'Only a passed prospect can be deleted' }, { status: 409 });
  }
  if (set.jobs.some(j => j.status === 'QUEUED' || j.status === 'RUNNING')) {
    return NextResponse.json({ error: 'A job is still running on this set' }, { status: 409 });
  }
  await prisma.drawingJob.deleteMany({ where: { setId: id } });
  await fs.rm(setDir(id), { recursive: true, force: true });
  const stub = await prisma.drawingSet.update({
    where: { id },
    data: { prospectStatus: 'DELETED', storagePath: '', markupPath: null, sizeBytes: 0 },
  });
  return NextResponse.json({ id: stub.id, prospectStatus: stub.prospectStatus });
}

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = parseInt(params.id, 10);
  const set = await prisma.drawingSet.findUnique({
    where: { id },
    include: {
      uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      project: { select: { id: true, projectName: true, status: true } },
      jobs: {
        orderBy: { createdAt: 'desc' },
        include: { requestedBy: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewDrawingSet(user, set)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  return NextResponse.json({
    ...set,
    titleBlock: parse(set.titleBlock, {}),
    jobs: set.jobs.map(j => ({ ...j, options: parse(j.options, {}), summary: parse(j.summary, {}), outputs: parse(j.outputs, []) })),
  });
}
