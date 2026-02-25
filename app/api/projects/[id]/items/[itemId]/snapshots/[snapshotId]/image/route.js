import prisma from '../../../../../../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../../../../lib/auth';

// GET /api/projects/[id]/items/[itemId]/snapshots/[snapshotId]/image
// Returns the base64 imageData for a single snapshot.
// Enforces the same role-based visibility as the main project GET endpoint.
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

    // Verify the project exists and enforce role-based access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const role = session.user.role;
    const canView =
      role === 'ADMIN' || role === 'ESTIMATOR' ||
      ((role === 'PM' || role === 'FIELD_SHOP') && project.status === 'PUBLISHED');

    if (!canView) {
      return NextResponse.json({ error: 'You do not have permission to view this resource' }, { status: 403 });
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
