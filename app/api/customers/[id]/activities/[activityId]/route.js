import prisma from '../../../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';

async function getUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

// PUT /api/customers/[id]/activities/[activityId]
export async function PUT(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activityId } = await params;
    const aId = parseInt(activityId);
    if (isNaN(aId)) {
      return NextResponse.json({ error: 'Invalid activity ID' }, { status: 400 });
    }

    const data = await request.json();

    const updateData = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.description !== undefined) updateData.description = data.description.trim();
    if (data.followUpDate !== undefined) updateData.followUpDate = data.followUpDate ? new Date(data.followUpDate) : null;
    if (data.markComplete) updateData.completedAt = new Date();
    if (data.completedAt !== undefined) updateData.completedAt = data.completedAt ? new Date(data.completedAt) : null;

    const activity = await prisma.customerActivity.update({
      where: { id: aId },
      data: updateData,
      include: {
        project: { select: { id: true, projectName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(activity);
  } catch (error) {
    console.error('Error updating activity:', error);
    return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });
  }
}

// DELETE /api/customers/[id]/activities/[activityId]
export async function DELETE(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activityId } = await params;
    const aId = parseInt(activityId);
    if (isNaN(aId)) {
      return NextResponse.json({ error: 'Invalid activity ID' }, { status: 400 });
    }

    await prisma.customerActivity.delete({ where: { id: aId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting activity:', error);
    return NextResponse.json({ error: 'Failed to delete activity' }, { status: 500 });
  }
}
