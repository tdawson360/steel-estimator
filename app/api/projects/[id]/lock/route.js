import prisma from '../../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { canEditProject } from '../../../../../lib/project-access';
import { isLockLive, lockView } from '../../../../../lib/project-lock';

// Soft edit lock on an estimate (see lib/project-lock.js).
//
// POST { action }:
//   claim     — take the lock if free/stale/mine; 409 if someone else holds it
//   heartbeat — same as claim; the estimator sends one every LOCK_HEARTBEAT_MS.
//               A 409 here means someone took over since the last beat.
//   takeover  — take the lock even if someone else holds it (edit rights only)
//   release   — drop the lock if it is mine (no-op otherwise; never 409s so a
//               page-unload beacon can fire blind)
//
// Every response carries `lock` = lockView for the caller.

const LOCK_SELECT = {
  id: true, status: true, isTemplate: true, estimatorId: true,
  lockedById: true, lockedAt: true, lockHeartbeatAt: true,
  lockedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
};

async function getUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

export async function POST(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const projectId = parseInt(id);
    const body = await request.json().catch(() => ({}));
    const action = body?.action || 'claim';
    const userId = Number(user.id);

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: LOCK_SELECT });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const now = new Date();

    if (action === 'release') {
      if (Number(project.lockedById) === userId) {
        await prisma.project.update({
          where: { id: projectId },
          data: { lockedById: null, lockedAt: null, lockHeartbeatAt: null },
        });
        return NextResponse.json({ released: true, lock: { held: false, mine: false, holder: null, since: null } });
      }
      return NextResponse.json({ released: false, lock: lockView(project, userId, now) });
    }

    if (!['claim', 'heartbeat', 'takeover'].includes(action)) {
      return NextResponse.json({ error: `Unknown lock action: ${action}` }, { status: 400 });
    }

    if (!canEditProject(user, project)) {
      return NextResponse.json({ error: 'You do not have permission to edit this estimate' }, { status: 403 });
    }

    const heldByOther = isLockLive(project, now.getTime()) && Number(project.lockedById) !== userId;
    if (heldByOther && action !== 'takeover') {
      const view = lockView(project, userId, now.getTime());
      return NextResponse.json(
        { error: `${view.holder.name || 'Another user'} is editing this estimate`, lock: view },
        { status: 409 },
      );
    }

    // Claim / refresh. Keep the original claim time while the same person
    // holds it, so "editing since 9:14" doesn't creep forward every beat.
    const alreadyMine = Number(project.lockedById) === userId && isLockLive(project, now.getTime());
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        lockedById: userId,
        lockedAt: alreadyMine ? project.lockedAt : now,
        lockHeartbeatAt: now,
      },
      select: LOCK_SELECT,
    });

    return NextResponse.json({
      lock: lockView(updated, userId, now.getTime()),
      takenFrom: heldByOther ? lockView(project, userId, now.getTime()).holder : null,
    });
  } catch (error) {
    console.error('Error updating project lock:', error);
    return NextResponse.json({ error: 'Failed to update edit lock' }, { status: 500 });
  }
}
