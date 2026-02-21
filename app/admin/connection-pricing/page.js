import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '../../../lib/auth';
import prisma from '../../../lib/db';
import ConnectionPricingClient from './ConnectionPricingClient';

export const dynamic = 'force-dynamic';

export default async function ConnectionPricingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard');

  const byFirstNumber = (a, b) => {
    const n = s => parseInt(s.match(/\d+/)?.[0] ?? '0', 10);
    return n(a.name) - n(b.name);
  };

  const [rates, wfCategories, cCategories] = await Promise.all([
    prisma.pricingRates.findUnique({ where: { id: 1 } }),
    prisma.connectionCategory.findMany({ where: { shapeType: 'WF' } }),
    prisma.connectionCategory.findMany({ where: { shapeType: 'C' } }),
  ]);

  wfCategories.sort(byFirstNumber);
  cCategories.sort(byFirstNumber);

  return (
    <ConnectionPricingClient
      rates={rates}
      wfCategories={wfCategories}
      cCategories={cCategories}
    />
  );
}
