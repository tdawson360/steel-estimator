import prisma from '../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

// GET /api/customers/follow-ups — upcoming follow-ups for dashboard widget
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const activities = await prisma.customerActivity.findMany({
      where: {
        followUpDate: { gte: new Date() },
        completedAt: null,
      },
      orderBy: { followUpDate: 'asc' },
      take: 5,
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error loading follow-ups:', error);
    return NextResponse.json({ error: 'Failed to load follow-ups' }, { status: 500 });
  }
}
