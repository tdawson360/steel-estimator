import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import prisma from '../../../../lib/db';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get('includeArchived') === '1';

  try {
    const where = includeArchived ? {} : { isArchived: false };
    // Templates are pricing references, not bids: PM/shop roles never see them
    // (they can't open non-published projects anyway); other roles get them
    // flagged so the dashboard can list them apart from the bid board.
    if (session.user.role === 'PM' || session.user.role === 'FIELD_SHOP') {
      where.isTemplate = false;
    }
    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        projectName: true,
        bidDate: true,
        bidTime: true,
        status: true,
        dashboardStatus: true,
        bidAmount: true,
        newOrCo: true,
        isArchived: true,
        isTemplate: true,
        createdAt: true,
        estimator: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error('Dashboard projects error:', error);
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 });
  }
}
