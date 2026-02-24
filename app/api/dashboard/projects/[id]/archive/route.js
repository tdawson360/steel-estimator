import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import prisma from '../../../../../../lib/db';

export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins can archive/unarchive projects
  const user = await prisma.user.findUnique({ where: { id: parseInt(session.user.id) } });
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only admins can archive or unarchive projects' }, { status: 403 });
  }

  const id = parseInt(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });

  try {
    // Toggle: read current state, then flip it
    const project = await prisma.project.findUnique({
      where: { id },
      select: { isArchived: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { isArchived: !project.isArchived },
      select: { id: true, isArchived: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Archive project error:', error);
    return NextResponse.json({ error: 'Failed to archive/unarchive project' }, { status: 500 });
  }
}
