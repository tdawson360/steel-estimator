import prisma from '../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';

async function getUser(request) {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

export async function GET(request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    const where = {};

    if (user.role === 'PM' || user.role === 'FIELD_SHOP') {
      where.status = 'PUBLISHED';
    }

    if (search) {
      where.OR = [
        { projectName: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { architect: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status && !(user.role === 'PM' || user.role === 'FIELD_SHOP')) {
      where.status = status;
    }

    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        projectName: true,
        customerName: true,
        projectAddress: true,
        status: true,
        estimateDate: true,
        estimatedBy: true,
        taxCategory: true,
        typeStructural: true,
        typeMiscellaneous: true,
        typeOrnamental: true,
        deliveryInstalled: true,
        deliveryFobJobsite: true,
        deliveryWillCall: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        createdBy: {
          select: { firstName: true, lastName: true }
        },
        _count: {
          select: { items: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json(projects);

  } catch (error) {
    console.error('Error listing projects:', error);
    return NextResponse.json(
      { error: 'Failed to load projects' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'ADMIN' && user.role !== 'ESTIMATOR') {
      return NextResponse.json({ error: 'You do not have permission to create estimates' }, { status: 403 });
    }

    const project = await prisma.project.create({
      data: {
        projectName: '',
        status: 'DRAFT',
        createdById: parseInt(user.id),
        items: {
          create: [
            {
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
                ]
              }
            }
          ]
        }
      },
      include: {
        items: {
          include: {
            recapCosts: true
          }
        }
      }
    });

    return NextResponse.json(project, { status: 201 });

  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
