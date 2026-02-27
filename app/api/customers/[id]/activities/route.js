import prisma from '../../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';

const VALID_TYPES = ['NOTE', 'CALL', 'EMAIL', 'MEETING', 'BID_RECEIVED', 'BID_SUBMITTED', 'FOLLOW_UP'];

async function getUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

// GET /api/customers/[id]/activities
export async function GET(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const customerId = parseInt(id);
    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type') || '';

    const where = { customerId };
    if (typeFilter && VALID_TYPES.includes(typeFilter)) {
      where.type = typeFilter;
    }

    const activities = await prisma.customerActivity.findMany({
      where,
      orderBy: { activityDate: 'desc' },
      include: {
        project: { select: { id: true, projectName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error listing activities:', error);
    return NextResponse.json({ error: 'Failed to load activities' }, { status: 500 });
  }
}

// POST /api/customers/[id]/activities
export async function POST(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const customerId = parseInt(id);
    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const data = await request.json();

    if (!data.type || !VALID_TYPES.includes(data.type)) {
      return NextResponse.json({ error: `Invalid activity type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }
    if (!data.description?.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const activity = await prisma.customerActivity.create({
      data: {
        customerId,
        type: data.type,
        description: data.description.trim(),
        projectId: data.projectId ? parseInt(data.projectId) : null,
        followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
        createdById: parseInt(user.id),
      },
      include: {
        project: { select: { id: true, projectName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    console.error('Error creating activity:', error);
    return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 });
  }
}
