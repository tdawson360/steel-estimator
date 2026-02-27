import prisma from '../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

async function getUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

// GET /api/customers/[id] — full customer detail with contacts, activities, projects
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

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }],
        },
        activities: {
          take: 20,
          orderBy: { activityDate: 'desc' },
          include: {
            project: { select: { id: true, projectName: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        projects: {
          select: {
            id: true,
            projectName: true,
            status: true,
            dashboardStatus: true,
            bidAmount: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error loading customer:', error);
    return NextResponse.json({ error: 'Failed to load customer' }, { status: 500 });
  }
}

// PUT /api/customers/[id] — update customer fields
export async function PUT(request, { params }) {
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

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.shortName !== undefined) updateData.shortName = data.shortName?.trim() || null;
    if (data.address !== undefined) updateData.address = data.address?.trim() || null;
    if (data.city !== undefined) updateData.city = data.city?.trim() || null;
    if (data.state !== undefined) updateData.state = data.state?.trim() || null;
    if (data.zip !== undefined) updateData.zip = data.zip?.trim() || null;
    if (data.phone !== undefined) updateData.phone = data.phone?.trim() || null;
    if (data.website !== undefined) updateData.website = data.website?.trim() || null;
    if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: updateData,
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

// DELETE /api/customers/[id] — delete customer, null out project links
export async function DELETE(request, { params }) {
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

    // Null out customerId on linked projects before deleting
    await prisma.project.updateMany({
      where: { customerId },
      data: { customerId: null },
    });

    await prisma.customer.delete({ where: { id: customerId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
