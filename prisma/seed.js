const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  
  if (userCount > 0) {
    console.log('Users already exist. Skipping seed.');
    const users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, email: true, role: true } });
    console.log('Existing users:', users);
    return;
  }

  const hashedPassword = await bcrypt.hash('BergerIron2024!', 12);

  const todd = await prisma.user.create({
    data: {
      email: 'tdawson@bergerinc.com',
      password: hashedPassword,
      firstName: 'Todd',
      lastName: 'Dawson',
      role: 'ADMIN',
    }
  });

  const leadEstimator = await prisma.user.create({
    data: {
      email: 'estimator@bergerinc.com',
      password: hashedPassword,
      firstName: 'Lead',
      lastName: 'Estimator',
      role: 'ADMIN',
    }
  });

  console.log('Created admin users:');
  console.log(`  ${todd.firstName} ${todd.lastName} (${todd.email}) - ${todd.role}`);
  console.log(`  ${leadEstimator.firstName} ${leadEstimator.lastName} (${leadEstimator.email}) - ${leadEstimator.role}`);
  console.log('Default password: BergerIron2024!');
  console.log('Seed complete!');
}

main()
  .catch(e => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
