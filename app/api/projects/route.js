// =============================================================================
// API: /api/projects
// =============================================================================
// GET  → List all projects (the dashboard)
// POST → Create a new blank project
//
// Think of this like the front desk of the filing room:
//   GET  = "Show me a list of every project folder you have"
//   POST = "Create a new empty project folder and hand it to me"
// =============================================================================

import prisma from '../../../lib/prisma';
import { NextResponse } from 'next/server';

// ── LIST ALL PROJECTS ────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    // Pull search/filter params from the URL if provided
    // Example: /api/projects?search=canopy&status=DRAFT
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    // Build the filter conditions
    const where = {};
    
    if (search) {
      // Search across project name, customer name, and architect
      where.OR = [
        { projectName: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { architect: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (status) {
      where.status = status;
    }

    // Fetch projects — just the summary info, not all the nested items/materials
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
        // Count of items gives a quick sense of project size
        _count: {
          select: { items: true }
        }
      },
      orderBy: { updatedAt: 'desc' } // Most recently touched projects first
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

// ── CREATE NEW PROJECT ───────────────────────────────────────────────────────
export async function POST(request) {
  try {
    // For now, we hardcode createdById to 1 (the first user).
    // Once we build authentication, this will come from the logged-in user.
    const TEMP_USER_ID = 1;

    // Create a blank project with one empty item (same as the current default)
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
              // Create the default recap cost entries
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
