// Queue a job on a drawing set: { kind: "SCOPE" | "MEASURE", options }.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import prisma from '../../../../../lib/db';
import { canManageDrawings } from '../../../../../lib/drawings/access';
import { enqueue } from '../../../../../lib/drawings/runner';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageDrawings(user)) return NextResponse.json({ error: 'Only estimators can run drawing jobs' }, { status: 403 });
  const id = parseInt(params.id, 10);
  const set = await prisma.drawingSet.findUnique({ where: { id } });
  if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!set.storagePath) return NextResponse.json({ error: 'Upload has not finished' }, { status: 409 });
  let body = {};
  try { body = await request.json(); } catch { /* defaults */ }
  const kind = body.kind === 'MEASURE' ? 'MEASURE' : 'SCOPE';
  const options = {};
  if (kind === 'MEASURE') {
    options.lengths = !!body.options?.lengths;
    if (body.options?.sheets) options.sheets = String(body.options.sheets).slice(0, 200);
  }
  if (body.options?.ocr === 'off') options.ocr = 'off';
  if (body.options?.allSheets) options.allSheets = true;
  const busy = await prisma.drawingJob.findFirst({ where: { setId: id, kind, status: { in: ['QUEUED', 'RUNNING'] } } });
  if (busy) return NextResponse.json({ error: `A ${kind.toLowerCase()} job is already ${busy.status.toLowerCase()}`, job: busy }, { status: 409 });
  const job = await enqueue({ setId: id, kind, options, userId: parseInt(user.id, 10) });
  return NextResponse.json(job, { status: 201 });
}
