// One drawing set with all its jobs.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import prisma from '../../../../lib/db';
import { canViewDrawingSet } from '../../../../lib/drawings/access';

export const dynamic = 'force-dynamic';

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
