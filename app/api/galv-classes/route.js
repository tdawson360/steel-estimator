import prisma from '../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { GALV_MINIMUM_CHARGE } from '../../../lib/estimating/galv';

// Galvanizer rate classes + minimum charge for the estimator (read-only;
// edited on Global Pricing Data). Any signed-in user may read.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [classes, rates] = await Promise.all([
      prisma.galvRateClass.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.pricingRates.findUnique({ where: { id: 1 }, select: { galvMinimumCharge: true } }),
    ]);
    return NextResponse.json({
      classes: classes.map(c => ({ code: c.code, name: c.name, ratePerCwt: c.ratePerCwt, sortOrder: c.sortOrder })),
      minimumCharge: rates?.galvMinimumCharge ?? GALV_MINIMUM_CHARGE,
    });
  } catch (error) {
    console.error('Error loading galv classes:', error);
    return NextResponse.json({ error: 'Failed to load galvanizing classes' }, { status: 500 });
  }
}
