import prisma from '../../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import bcrypt from 'bcryptjs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return null;
  }
  return session.user;
}

export async function PATCH(request, { params }) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);
    const data = await request.json();

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updateData = {};

    if (data.firstName !== undefined) updateData.firstName = data.firstName.trim();
    if (data.lastName !== undefined) updateData.lastName = data.lastName.trim();
    if (data.email !== undefined) {
      const normalized = data.email.trim().toLowerCase();
      const conflict = await prisma.user.findFirst({
        where: { email: normalized, NOT: { id: userId } }
      });
      if (conflict) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
      updateData.email = normalized;
    }
    if (data.role !== undefined) {
      const validRoles = ['ADMIN', 'ESTIMATOR', 'PM', 'FIELD_SHOP'];
      if (!validRoles.includes(data.role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      updateData.role = data.role;
    }
    if (data.active !== undefined) updateData.active = data.active;
    if (data.password) {
      if (typeof data.password !== 'string' || data.password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      updateData.password = await bcrypt.hash(data.password, 12);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        active: true,
        createdAt: true,
        lastLoginAt: true,
      }
    });

    return NextResponse.json(updated);

  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
