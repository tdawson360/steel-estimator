import prisma from '../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { compareHardware, hardwareLabel } from '../../../lib/hardware';

// Hardware catalog for the estimator's Hardware picker (read-only; edited on
// Global Pricing Data → Hardware). Any signed-in user may read. Inactive
// items are omitted — a row that already links to one keeps its snapshot.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const items = await prisma.hardwareItem.findMany({ where: { active: true } });
    items.sort(compareHardware);
    return NextResponse.json({
      items: items.map(i => ({
        id: i.id, kind: i.kind, family: i.family,
        diameter: i.diameter, diameterIn: i.diameterIn,
        length: i.length, lengthIn: i.lengthIn, finish: i.finish,
        unitPrice: i.unitPrice, weightEach: i.weightEach, isDefault: i.isDefault,
        bitDiaIn: i.bitDiaIn, embedMinIn: i.embedMinIn, embedMaxIn: i.embedMaxIn,
        adhesiveId: i.adhesiveId, cartridgeMl: i.cartridgeMl,
        label: hardwareLabel(i),
      })),
    });
  } catch (error) {
    console.error('Error loading hardware catalog:', error);
    return NextResponse.json({ error: 'Failed to load hardware catalog' }, { status: 500 });
  }
}
