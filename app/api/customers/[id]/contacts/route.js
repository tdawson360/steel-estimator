import prisma from '../../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';

async function getUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

// GET /api/customers/[id]/contacts
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

    const contacts = await prisma.customerContact.findMany({
      where: { customerId },
      orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }],
    });

    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Error listing contacts:', error);
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }
}

// POST /api/customers/[id]/contacts
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
    if (!data.firstName?.trim() || !data.lastName?.trim()) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    // If setting as primary, clear other primaries first
    if (data.isPrimary) {
      await prisma.customerContact.updateMany({
        where: { customerId },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.customerContact.create({
      data: {
        customerId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        title: data.title?.trim() || null,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        mobile: data.mobile?.trim() || null,
        isPrimary: data.isPrimary || false,
        notes: data.notes?.trim() || null,
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
