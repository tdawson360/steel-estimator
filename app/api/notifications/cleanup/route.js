import prisma from '../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

// DELETE /api/notifications/cleanup — remove notifications older than 90 days
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    return NextResponse.json({ deleted: result.count });

  } catch (error) {
    console.error('Error cleaning up notifications:', error);
    return NextResponse.json({ error: 'Failed to clean up notifications' }, { status: 500 });
  }
}
