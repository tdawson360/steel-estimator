import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import prisma from '../../../../../../lib/db';

export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = parseInt(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });

  try {
    const updated = await prisma.project.update({
      where: { id },
      data: { isArchived: true },
      select: { id: true, isArchived: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Archive project error:', error);
    return NextResponse.json({ error: 'Failed to archive project' }, { status: 500 });
  }
}
