'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import prisma from '../../../lib/db';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'ADMIN') throw new Error('Unauthorized');
  return session.user;
}

export async function updatePricingRates(data) {
  const user = await requireAdmin();
  await prisma.pricingRates.update({
    where: { id: 1 },
    data: { ...data, updatedBy: user.id },
  });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

export async function updateConnectionCategory(id, data) {
  await requireAdmin();
  await prisma.connectionCategory.update({ where: { id }, data });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

export async function getBeamBySize(beamSize) {
  await requireAdmin();
  return prisma.beamConnectionData.findUnique({
    where: { beamSize: beamSize.trim().toUpperCase() },
    include: { category: true },
  });
}

export async function updateBeamOverride(beamSize, data) {
  await requireAdmin();
  await prisma.beamConnectionData.update({
    where: { beamSize: beamSize.trim().toUpperCase() },
    data,
  });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}
