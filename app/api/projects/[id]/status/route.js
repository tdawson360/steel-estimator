import prisma from '../../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';

const VALID_TRANSITIONS = {
  DRAFT:     { IN_REVIEW: ['ADMIN', 'ESTIMATOR'] },
  IN_REVIEW: { PUBLISHED: ['ADMIN'], DRAFT: ['ADMIN', 'ESTIMATOR'] },
  PUBLISHED: { REOPENED: ['ADMIN'] },
  REOPENED:  { PUBLISHED: ['ADMIN'] },
};

const ADMIN_RESET = ['ADMIN'];

export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const projectId = parseInt(id);
    const { status: newStatus } = await request.json();
    const userRole = session.user.role;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true, projectName: true, estimatorId: true }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const currentStatus = project.status;

    if (newStatus === 'DRAFT' && ADMIN_RESET.includes(userRole)) {
      // Admin can reset any status to DRAFT
    } else {
      const transitions = VALID_TRANSITIONS[currentStatus];
      if (!transitions || !transitions[newStatus]) {
        return NextResponse.json({ error: `Cannot transition from ${currentStatus} to ${newStatus}` }, { status: 400 });
      }

      const allowedRoles = transitions[newStatus];
      if (!allowedRoles.includes(userRole)) {
        return NextResponse.json({ error: 'You do not have permission to perform this status change' }, { status: 403 });
      }
    }

    const updateData = { status: newStatus };

    if (newStatus === 'PUBLISHED') {
      updateData.publishedAt = new Date();
      updateData.publishedById = parseInt(session.user.id);
    }

    if (newStatus === 'DRAFT' || newStatus === 'REOPENED') {
      updateData.publishedAt = null;
      updateData.publishedById = null;
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: updateData,
      select: {
        id: true,
        status: true,
        publishedAt: true,
        publishedById: true,
      }
    });

    // ── Notifications ──────────────────────────────────────────────────────
    const projName = project.projectName || 'Untitled Project';
    const actorId = parseInt(session.user.id);

    async function notifyAdmins(message) {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', active: true, NOT: { id: actorId } },
        select: { id: true }
      });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map(a => ({ recipientId: a.id, projectId, message }))
        });
      }
    }

    async function notifyEstimator(message) {
      if (!project.estimatorId || project.estimatorId === actorId) return;
      await prisma.notification.create({
        data: { recipientId: project.estimatorId, projectId, message }
      });
    }

    if (newStatus === 'IN_REVIEW') {
      await notifyAdmins(`"${projName}" has been submitted for review`);
    } else if (newStatus === 'DRAFT' && currentStatus === 'IN_REVIEW') {
      await notifyAdmins(`"${projName}" review submission was recalled`);
    } else if (newStatus === 'PUBLISHED' && currentStatus === 'IN_REVIEW') {
      await notifyEstimator(`Your estimate "${projName}" has been published`);
    } else if (newStatus === 'PUBLISHED' && currentStatus === 'REOPENED') {
      await notifyEstimator(`Your estimate "${projName}" has been re-published`);
    } else if (newStatus === 'REOPENED') {
      await notifyEstimator(`Your estimate "${projName}" has been reopened for editing`);
    }
    // ──────────────────────────────────────────────────────────────────────

    return NextResponse.json(updated);

  } catch (error) {
    console.error('Error updating status:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
