// Chase a prospect: { projectName } creates a DRAFT estimate carrying only
// that name, links the set to it and marks the set CHASE. Nothing else on
// Project Info is filled in (docs/drawings-page-plan.md: the title block is
// display only). A set that already has a project answers with it.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import prisma from '../../../../../lib/db';
import { canManageDrawings } from '../../../../../lib/drawings/access';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageDrawings(user)) return NextResponse.json({ error: 'Only estimators can chase a prospect' }, { status: 403 });
  const id = parseInt(params.id, 10);
  const set = await prisma.drawingSet.findUnique({ where: { id }, include: { project: { select: { id: true, projectName: true } } } });
  if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (set.prospectStatus === 'DELETED' || !set.storagePath) return NextResponse.json({ error: 'This set has been deleted' }, { status: 409 });
  if (set.project) return NextResponse.json({ projectId: set.project.id, projectName: set.project.projectName, existing: true });

  let body = {};
  try { body = await request.json(); } catch { /* name defaults to the set name */ }
  const projectName = String(body.projectName ?? '').trim().slice(0, 200) || set.name;

  // Same shape as POST /api/projects: one starter item with its recap rows,
  // per-piece handling on. Project.version starts at its default; the
  // estimator loads it before any save.
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        projectName,
        status: 'DRAFT',
        createdById: parseInt(user.id, 10),
        handlingEnabled: true,
        items: {
          create: [{
            itemNumber: '001',
            itemName: 'New Item',
            sortOrder: 0,
            recapCosts: {
              create: [
                { costType: 'installation', cost: 0, markup: 0, total: 0 },
                { costType: 'drafting', cost: 0, markup: 0, total: 0 },
                { costType: 'engineering', cost: 0, markup: 0, total: 0 },
                { costType: 'projectManagement', hours: 0, rate: 60, total: 0 },
                { costType: 'shipping', cost: 0, markup: 0, total: 0 },
              ],
            },
          }],
        },
      },
      select: { id: true, projectName: true },
    });
    await tx.drawingSet.update({ where: { id }, data: { projectId: created.id, prospectStatus: 'CHASE', passedAt: null, passedById: null } });
    return created;
  });
  return NextResponse.json({ projectId: project.id, projectName: project.projectName, existing: false }, { status: 201 });
}
