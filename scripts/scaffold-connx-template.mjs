// Scaffold the "Connx Template" project: one empty item per connection
// category × {Bolted, Welded}, pre-linked to the Global Pricing Data columns.
// The lead estimator takes off each item as ONE connection (angles/plates,
// holes, bolts, labor); Sync then stamps each item's shop total onto its
// linked Bolted/Welded price cell.
//
// Idempotent: existing project/items are kept, missing ones are added, and
// category links are only filled where empty. Run with:
//   node scripts/scaffold-connx-template.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const admin =
    (await prisma.user.findFirst({ where: { role: 'ADMIN', active: true }, orderBy: { id: 'asc' } })) ??
    (await prisma.user.findFirst({ orderBy: { id: 'asc' } }));
  if (!admin) throw new Error('No user found to own the template project — seed users first.');

  let project = await prisma.project.findFirst({
    where: { isTemplate: true, projectName: 'Connx Template' },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        projectName: 'Connx Template',
        isTemplate: true,
        status: 'DRAFT',
        description:
          'Living reference estimate for standard connection pricing. Each item is ONE connection, taken off line by line. Global Pricing Data syncs Bolted/Welded prices from these item totals.',
        estimatedBy: `${admin.firstName} ${admin.lastName}`.trim(),
        createdById: admin.id,
      },
    });
    console.log(`✓ Created project "Connx Template" (#${project.id})`);
  } else {
    console.log(`• Project "Connx Template" (#${project.id}) already exists`);
  }

  const existingItems = await prisma.item.findMany({ where: { projectId: project.id } });
  const byName = new Map(existingItems.map(i => [i.itemName, i]));
  let sortOrder = existingItems.length;

  const byFirstNumber = (a, b) => {
    const n = s => parseInt(s.match(/\d+/)?.[0] ?? '0', 10);
    return n(a.name) - n(b.name);
  };
  const categories = await prisma.connectionCategory.findMany();
  categories.sort((a, b) => (a.shapeType === b.shapeType ? byFirstNumber(a, b) : a.shapeType === 'WF' ? -1 : 1));

  let created = 0;
  let linked = 0;
  for (const cat of categories) {
    const base = cat.name.replace(/\s*Connx$/i, '');
    for (const kind of ['Bolted', 'Welded']) {
      const itemName = `${base} ${kind}`;
      let item = byName.get(itemName);
      if (!item) {
        sortOrder += 1;
        item = await prisma.item.create({
          data: {
            projectId: project.id,
            itemName,
            itemNumber: String(sortOrder).padStart(3, '0'),
            sortOrder,
          },
        });
        byName.set(itemName, item);
        created++;
      }
      const linkField = `${kind.toLowerCase()}TemplateItemId`;
      if (cat[linkField] == null) {
        await prisma.connectionCategory.update({ where: { id: cat.id }, data: { [linkField]: item.id } });
        linked++;
      }
    }
  }

  console.log(`✓ Items: ${created} created, ${byName.size} total`);
  console.log(`✓ Category links filled: ${linked}`);
  console.log('Done. Take off each item as ONE connection, then use "Preview Sync" on the Global Pricing Data page.');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
