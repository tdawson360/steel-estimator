// prisma/seed-connection-data.ts
// Run with: npx tsx prisma/seed-connection-data.ts

import { PrismaClient } from '@prisma/client'
import connectionData from '../src/data/connection_data.json'

const prisma = new PrismaClient()

async function seedConnectionData() {
  console.log('🔧 Seeding connection weights and pricing data...')

  // 1. Upsert pricing rates (singleton)
  await prisma.pricingRates.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      shopLaborRatePerHr: connectionData.pricingRates.shopLaborRatePerHr,
      materialAvgPricePerLb: connectionData.pricingRates.materialAvgPricePerLb,
      quantityDiscountOver20Pct: connectionData.pricingRates.quantityDiscountOver20Pct,
      quantityDiscountOver100Pct: connectionData.pricingRates.quantityDiscountOver100Pct,
    },
  })
  console.log('  ✓ Pricing rates')

  // 2. Upsert WF categories
  for (const cat of connectionData.wfCategories) {
    await prisma.connectionCategory.upsert({
      where: { name: cat.name },
      update: {
        connxWeightLbs: cat.connxWeightLbs,
        momentConnxWeightLbs: cat.momentConnxWeightLbs,
        laborHours: cat.laborHours,
        providesTakeoffCost: cat.connxCostProvideTO,
        connxCost: cat.connxCostProvideTO ? null : (cat.connxCost ?? null),
        momentConnxCost: cat.momentConnxCostProvideTO ? null : (cat.momentConnxCost ?? null),
        singleCopeCost: cat.singleCopeCostBase,
        doubleCopeCost: cat.doubleCopeCostBase,
        straightCutCost: cat.straightCutCost,
        miterCutCost: cat.miterCutCost,
        doubleMiterCost: cat.doubleMiterCost,
        singleCopeMiterCost: cat.singleCopeMiterCost,
        doubleCopeMiterCost: cat.doubleCopeMiterCost,
        beamSizeRange: cat.beamSizeRange ?? null,
        shapesIncluded: cat.shapesIncluded,
      },
      create: {
        shapeType: 'WF',
        name: cat.name,
        shapesIncluded: cat.shapesIncluded,
        beamSizeRange: cat.beamSizeRange ?? null,
        laborHours: cat.laborHours,
        connxWeightLbs: cat.connxWeightLbs,
        momentConnxWeightLbs: cat.momentConnxWeightLbs,
        providesTakeoffCost: cat.connxCostProvideTO,
        connxCost: cat.connxCostProvideTO ? null : (cat.connxCost ?? null),
        momentConnxCost: cat.momentConnxCostProvideTO ? null : (cat.momentConnxCost ?? null),
        singleCopeCost: cat.singleCopeCostBase,
        doubleCopeCost: cat.doubleCopeCostBase,
        straightCutCost: cat.straightCutCost,
        miterCutCost: cat.miterCutCost,
        doubleMiterCost: cat.doubleMiterCost,
        singleCopeMiterCost: cat.singleCopeMiterCost,
        doubleCopeMiterCost: cat.doubleCopeMiterCost,
      },
    })
  }
  console.log(`  ✓ ${connectionData.wfCategories.length} WF categories`)

  // 3. Upsert C/MC categories
  for (const cat of connectionData.cCategories) {
    await prisma.connectionCategory.upsert({
      where: { name: cat.name },
      update: {
        connxWeightLbs: cat.connxWeightLbs,
        momentConnxWeightLbs: cat.momentConnxWeightLbs,
        laborHours: cat.laborHours,
        connxCost: cat.connxCost,
        momentConnxCost: cat.momentConnxCost,
        singleCopeCost: cat.singleCopeCostBase,
        doubleCopeCost: cat.doubleCopeCostBase,
        straightCutCost: cat.straightCutCost,
        miterCutCost: cat.miterCutCost,
        doubleMiterCost: cat.doubleMierCost ?? cat.doubleMiterCost,
        singleCopeMiterCost: cat.singleCopeMiterCost,
        doubleCopeMiterCost: cat.doubleCopeMiterCost,
        shapesIncluded: cat.shapesIncluded,
      },
      create: {
        shapeType: 'C',
        name: cat.name,
        shapesIncluded: cat.shapesIncluded,
        laborHours: cat.laborHours,
        connxWeightLbs: cat.connxWeightLbs,
        momentConnxWeightLbs: cat.momentConnxWeightLbs,
        providesTakeoffCost: false,
        connxCost: cat.connxCost,
        momentConnxCost: cat.momentConnxCost,
        singleCopeCost: cat.singleCopeCostBase,
        doubleCopeCost: cat.doubleCopeCostBase,
        straightCutCost: cat.straightCutCost,
        miterCutCost: cat.miterCutCost,
        doubleMiterCost: cat.doubleMiterCost,
        singleCopeMiterCost: cat.singleCopeMiterCost,
        doubleCopeMiterCost: cat.doubleCopeMiterCost,
      },
    })
  }
  console.log(`  ✓ ${connectionData.cCategories.length} C/MC categories`)

  // 4. Build category id map from DB
  const allCats = await prisma.connectionCategory.findMany({
    select: { id: true, name: true, shapesIncluded: true, shapeType: true },
  })

  // Helper: map WF beam size (e.g. "W21X44") to its category id
  function getWFCategoryId(beamSize: string): string {
    const prefix = beamSize.match(/^(W\d+)/)?.[1] ?? ''
    const grouped: Record<string, string[]> = {
      'W16, W18': ['W16', 'W18'],
      'W12, W14': ['W12', 'W14'],
      'W8, W10': ['W8', 'W10'],
      'W4, W5': ['W4', 'W5'],
    }
    for (const cat of allCats) {
      if (cat.shapeType !== 'WF') continue
      const shapes = cat.shapesIncluded.split(',').map((s: string) => s.trim())
      if (shapes.includes(prefix)) return cat.id
    }
    return ''
  }

  // Helper: map C/MC beam size to category id
  const cNameMap: Record<string, string[]> = {
    'MC18 Connx':        ['MC18'],
    'C15/MC13 Connx':    ['C15', 'MC13'],
    'C12/MC12 Connx':    ['C12', 'MC12'],
    'C8-10/MC8-10 Connx':['C8','C9','C10','MC8','MC9','MC10'],
    'C6-7/MC6-7 Connx':  ['C6','C7','MC6','MC7'],
    'C3-5/MC3-4 Connx':  ['C3','C4','C5','MC3','MC4'],
  }
  function getCCategoryId(beamSize: string): string {
    const m = beamSize.match(/^(MC|C)(\d+)/)
    if (!m) return ''
    const matchPrefix = `${m[1]}${m[2]}`
    for (const [catName, prefixes] of Object.entries(cNameMap)) {
      if (prefixes.includes(matchPrefix)) {
        const cat = allCats.find(c => c.shapeType === 'C' && c.name === catName)
        if (cat) return cat.id
      }
    }
    return ''
  }

  // 5. Seed WF beam sizes
  let wfCount = 0
  for (const beam of connectionData.wfBeams) {
    const categoryId = getWFCategoryId(beam.beamSize)
    if (!categoryId) {
      console.warn(`  ⚠ No WF category for ${beam.beamSize}`)
      continue
    }
    await prisma.beamConnectionData.upsert({
      where: { beamSize: beam.beamSize },
      update: {
        categoryId,
        connxWeightLbs: beam.connxWeightLbs,
        momentConnxWeightLbs: beam.momentConnxWeightLbs,
        connxCostProvideTO: beam.connxCostProvideTO,
        connxCost: beam.connxCostProvideTO ? null : (beam.connxCost ?? null),
        momentConnxCostProvideTO: beam.momentConnxCostProvideTO,
        momentConnxCost: beam.momentConnxCostProvideTO ? null : (beam.momentConnxCost ?? null),
        singleCopeCost: beam.singleCopeCost,
        doubleCopeCost: beam.doubleCopeCost,
        straightCutCost: beam.straightCutCost ?? null,
        miterCutCost: beam.miterCutCost ?? null,
        doubleMiterCost: beam.doubleMiterCost ?? null,
        singleCopeMiterCost: beam.singleCopeMiterCost ?? null,
        doubleCopeMiterCost: beam.doubleCopeMiterCost ?? null,
      },
      create: {
        beamSize: beam.beamSize,
        shapeType: 'WF',
        categoryId,
        connxWeightLbs: beam.connxWeightLbs,
        momentConnxWeightLbs: beam.momentConnxWeightLbs,
        connxCostProvideTO: beam.connxCostProvideTO,
        connxCost: beam.connxCostProvideTO ? null : (beam.connxCost ?? null),
        momentConnxCostProvideTO: beam.momentConnxCostProvideTO,
        momentConnxCost: beam.momentConnxCostProvideTO ? null : (beam.momentConnxCost ?? null),
        singleCopeCost: beam.singleCopeCost,
        doubleCopeCost: beam.doubleCopeCost,
        straightCutCost: beam.straightCutCost ?? null,
        miterCutCost: beam.miterCutCost ?? null,
        doubleMiterCost: beam.doubleMiterCost ?? null,
        singleCopeMiterCost: beam.singleCopeMiterCost ?? null,
        doubleCopeMiterCost: beam.doubleCopeMiterCost ?? null,
      },
    })
    wfCount++
  }
  console.log(`  ✓ ${wfCount} WF beam sizes`)

  // 6. Seed C/MC beam sizes
  let cCount = 0
  for (const beam of connectionData.cBeams) {
    const categoryId = getCCategoryId(beam.beamSize)
    if (!categoryId) {
      console.warn(`  ⚠ No C/MC category for ${beam.beamSize}`)
      continue
    }
    await prisma.beamConnectionData.upsert({
      where: { beamSize: beam.beamSize },
      update: {
        categoryId,
        connxWeightLbs: beam.connxWeightLbs,
        momentConnxWeightLbs: beam.momentConnxWeightLbs,
        connxCostProvideTO: false,
        connxCost: beam.connxCost,
        momentConnxCostProvideTO: false,
        momentConnxCost: beam.momentConnxCost,
        singleCopeCost: beam.singleCopeCost,
        doubleCopeCost: beam.doubleCopeCost,
        straightCutCost: beam.straightCutCost ?? null,
        miterCutCost: beam.miterCutCost ?? null,
        doubleMiterCost: beam.doubleMiterCost ?? null,
        singleCopeMiterCost: beam.singleCopeMiterCost ?? null,
        doubleCopeMiterCost: beam.doubleCopeMiterCost ?? null,
      },
      create: {
        beamSize: beam.beamSize,
        shapeType: 'C',
        categoryId,
        connxWeightLbs: beam.connxWeightLbs,
        momentConnxWeightLbs: beam.momentConnxWeightLbs,
        connxCostProvideTO: false,
        connxCost: beam.connxCost,
        momentConnxCostProvideTO: false,
        momentConnxCost: beam.momentConnxCost,
        singleCopeCost: beam.singleCopeCost,
        doubleCopeCost: beam.doubleCopeCost,
        straightCutCost: beam.straightCutCost ?? null,
        miterCutCost: beam.miterCutCost ?? null,
        doubleMiterCost: beam.doubleMiterCost ?? null,
        singleCopeMiterCost: beam.singleCopeMiterCost ?? null,
        doubleCopeMiterCost: beam.doubleCopeMiterCost ?? null,
      },
    })
    cCount++
  }
  console.log(`  ✓ ${cCount} C/MC beam sizes`)

  console.log('\n✅ Connection data seeding complete!')
  console.log(`   Total beams: ${wfCount + cCount}`)
}

seedConnectionData()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
