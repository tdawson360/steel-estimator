// Pass on a prospect (or un-pass it): { pass: true|false }.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import prisma from '../../../../../lib/db';
import { canManageDrawings } from '../../../../../lib/drawings/access';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageDrawings(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = parseInt(params.id, 10);
  const set = await prisma.drawingSet.findUnique({ where: { id } });
  if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (set.projectId) return NextResponse.json({ error: 'This set belongs to a project' }, { status: 409 });
  let body = {};
  try { body = await request.json(); } catch { /* default pass */ }
  const pass = body.pass !== false;
  const updated = await prisma.drawingSet.update({
    where: { id },
    data: pass
      ? { prospectStatus: 'PASS', passedAt: new Date(), passedById: parseInt(user.id, 10) }
      : { prospectStatus: 'SCOPED', passedAt: null, passedById: null },
  });
  return NextResponse.json(updated);
}
