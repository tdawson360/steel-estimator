import prisma from '../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

// PATCH /api/notifications/[id] — mark single notification as read
export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const notifId = parseInt(id);
    const userId = parseInt(session.user.id);

    const notif = await prisma.notification.findUnique({
      where: { id: notifId },
      select: { recipientId: true }
    });

    if (!notif) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (notif.recipientId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.notification.update({
      where: { id: notifId },
      data: { isRead: true }
    });

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('Error marking notification read:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
