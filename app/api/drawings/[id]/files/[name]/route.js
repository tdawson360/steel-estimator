// Download a set's original PDF, its markup copy, or a job output.
//   /api/drawings/12/files/original.pdf
//   /api/drawings/12/files/markup.pdf
//   /api/drawings/12/files/scope.pdf?job=34      (job outputs)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable, Transform } from 'stream';
import { authOptions } from '../../../../../../lib/auth';
import prisma from '../../../../../../lib/db';
import { canViewDrawingSet } from '../../../../../../lib/drawings/access';
import { jobDir, safeJoin, setDir } from '../../../../../../lib/drawings/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = { '.pdf': 'application/pdf', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = parseInt(params.id, 10);
  const set = await prisma.drawingSet.findUnique({ where: { id }, include: { project: { select: { id: true, status: true } } } });
  if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewDrawingSet(user, set)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const name = path.basename(decodeURIComponent(params.name));
  const jobId = new URL(request.url).searchParams.get('job');
  let filePath;
  try {
    if (jobId) {
      const job = await prisma.drawingJob.findUnique({ where: { id: parseInt(jobId, 10) }, select: { setId: true } });
      if (!job || job.setId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      filePath = safeJoin(jobDir(id, jobId), name);
    } else if (name === 'original.pdf' || name === 'markup.pdf') {
      filePath = safeJoin(setDir(id), name);
    } else {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: 'Bad path' }, { status: 400 });
  }
  let st;
  try { st = await fsp.stat(filePath); } catch { return NextResponse.json({ error: 'File missing' }, { status: 404 }); }
  const ext = path.extname(name).toLowerCase();
  const nice = name === 'original.pdf' ? set.originalName
    : name === 'markup.pdf' ? `MARKUPS_${set.originalName}`
    : `${set.name} - ${name}`;
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
    headers: {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': String(st.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nice.replace(/["\\]/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
