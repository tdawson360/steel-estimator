import prisma from '../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';

async function getUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

// GET /api/customers — list all customers with project stats
export async function GET(request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    const where = {};
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        projects: {
          select: {
            id: true,
            dashboardStatus: true,
            bidAmount: true,
          },
        },
        _count: { select: { projects: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Compute totalProjects, wonProjects, totalVolume
    const result = customers.map(c => {
      const totalProjects = c._count.projects;
      const wonProjects = c.projects.filter(p => p.dashboardStatus === 'Awarded to BIW').length;
      const totalVolume = c.projects
        .filter(p => p.dashboardStatus === 'Awarded to BIW')
        .reduce((sum, p) => sum + (p.bidAmount || 0), 0);

      const { projects, _count, ...rest } = c;
      return { ...rest, totalProjects, wonProjects, totalVolume };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing customers:', error);
    return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 });
  }
}

// POST /api/customers — create a new customer
export async function POST(request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    if (!data.name || !data.name.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        name: data.name.trim(),
        shortName: data.shortName?.trim() || null,
        address: data.address?.trim() || null,
        city: data.city?.trim() || null,
        state: data.state?.trim() || null,
        zip: data.zip?.trim() || null,
        phone: data.phone?.trim() || null,
        website: data.website?.trim() || null,
        notes: data.notes?.trim() || null,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
