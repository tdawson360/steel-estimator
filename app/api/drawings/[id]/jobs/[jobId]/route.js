// Poll a job (GET) or cancel it (DELETE).
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import prisma from '../../../../../../lib/db';
import { canManageDrawings, canViewDrawingSet } from '../../../../../../lib/drawings/access';
import { cancel } from '../../../../../../lib/drawings/runner';

export const dynamic = 'force-dynamic';

async function load(params) {
  return prisma.drawingJob.findUnique({
    where: { id: parseInt(params.jobId, 10) },
    include: { set: { include: { project: { select: { id: true, status: true } } } } },
  });
}

const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const job = await load(params);
  if (!job || job.setId !== parseInt(params.id, 10)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewDrawingSet(user, job.set)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { set, ...rest } = job;
  return NextResponse.json({ ...rest, options: parse(job.options, {}), summary: parse(job.summary, {}), outputs: parse(job.outputs, []) });
}

export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const job = await load(params);
  if (!job || job.setId !== parseInt(params.id, 10)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const mine = job.requestedById === parseInt(user.id, 10);
  if (!(user.role === 'ADMIN' || (mine && canManageDrawings(user)))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const updated = await cancel(job.id);
  return NextResponse.json({ id: job.id, status: updated?.status || job.status });
}
