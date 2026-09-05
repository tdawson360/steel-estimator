// Is the Python sidecar runnable on this server?
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { health } from '../../../../lib/drawings/runner';
import { drawingsDir } from '../../../../lib/drawings/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const info = await health();
  return NextResponse.json({ ...info, drawingsDir: drawingsDir() });
}
