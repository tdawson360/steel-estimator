import prisma from '../../../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';

async function getUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

// PUT /api/customers/[id]/contacts/[contactId]
export async function PUT(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, contactId } = await params;
    const customerId = parseInt(id);
    const cId = parseInt(contactId);
    if (isNaN(customerId) || isNaN(cId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const data = await request.json();

    // If setting as primary, clear other primaries first
    if (data.isPrimary) {
      await prisma.customerContact.updateMany({
        where: { customerId, id: { not: cId } },
        data: { isPrimary: false },
      });
    }

    const updateData = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName.trim();
    if (data.lastName !== undefined) updateData.lastName = data.lastName.trim();
    if (data.title !== undefined) updateData.title = data.title?.trim() || null;
    if (data.email !== undefined) updateData.email = data.email?.trim() || null;
    if (data.phone !== undefined) updateData.phone = data.phone?.trim() || null;
    if (data.mobile !== undefined) updateData.mobile = data.mobile?.trim() || null;
    if (data.isPrimary !== undefined) updateData.isPrimary = data.isPrimary;
    if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;

    const contact = await prisma.customerContact.update({
      where: { id: cId },
      data: updateData,
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error updating contact:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
}

// DELETE /api/customers/[id]/contacts/[contactId]
export async function DELETE(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { contactId } = await params;
    const cId = parseInt(contactId);
    if (isNaN(cId)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    await prisma.customerContact.delete({ where: { id: cId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }
}
