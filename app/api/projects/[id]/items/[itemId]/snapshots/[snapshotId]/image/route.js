import prisma from '../../../../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../../lib/auth';

// GET /api/projects/[id]/items/[itemId]/snapshots/[snapshotId]/image
// Returns the base64 imageData for a single snapshot.
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, itemId, snapshotId } = await params;
    const projectId = parseInt(id);
    const parsedItemId = parseInt(itemId);
    const parsedSnapshotId = parseInt(snapshotId);

    if (!projectId || !parsedItemId || !parsedSnapshotId) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Fetch only imageData, verifying the snapshot belongs to the correct item and project
    const snapshot = await prisma.itemSnapshot.findFirst({
      where: {
        id: parsedSnapshotId,
        itemId: parsedItemId,
        item: { projectId },
      },
      select: { id: true, imageData: true },
    });

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    return NextResponse.json({ id: snapshot.id, imageData: snapshot.imageData });

  } catch (error) {
    console.error('Error fetching snapshot image:', error);
    return NextResponse.json({ error: 'Failed to fetch snapshot image' }, { status: 500 });
  }
}
