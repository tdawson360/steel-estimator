import prisma from '../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';

// Per-piece handling classes + the shop labor rate for the estimator
// (read-only; edited on Global Pricing Data → Handling). Any signed-in user.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [classes, rates] = await Promise.all([
      prisma.handlingClass.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.pricingRates.findUnique({ where: { id: 1 }, select: { shopLaborRatePerHr: true } }),
    ]);
    return NextResponse.json({
      classes: classes.map(c => ({ code: c.code, name: c.name, minLb: c.minLb, maxLb: c.maxLb, minutesPerPiece: c.minutesPerPiece, sortOrder: c.sortOrder, active: c.active })),
      shopLaborRatePerHr: rates?.shopLaborRatePerHr ?? 65,
    });
  } catch (error) {
    console.error('Error loading handling classes:', error);
    return NextResponse.json({ error: 'Failed to load handling classes' }, { status: 500 });
  }
}
