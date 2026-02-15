import prisma from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    const where = {};

    if (search) {
      where.OR = [
        { projectName: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { architect: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
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
    const TEMP_USER_ID = 1;

    const project = await prisma.project.create({
      data: {
        projectName: '',
        status: 'DRAFT',
        createdById: TEMP_USER_ID,
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
