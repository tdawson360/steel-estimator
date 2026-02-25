const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // Dummy credentials for local development only.
  // Replace with real accounts before deploying to production.
  const users = [
    {
      email: 'tdawson@bergerinc.com',
      password: 'BergerIron2024!',
      firstName: 'Todd',
      lastName: 'Dawson',
      role: 'ADMIN',
    },
    {
      email: 'estimator@bergerinc.com',
      password: 'BergerIron2024!',
      firstName: 'Lead',
      lastName: 'Estimator',
      role: 'ADMIN',
    },
    {
      email: 'test@berger.com',
      password: 'test123',
      firstName: 'Test',
      lastName: 'User',
      role: 'ADMIN',
    },
  ];

  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},  // don't overwrite existing records
      create: {
        email: u.email,
        password: hashed,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
      },
    });
    console.log(`  ✓ ${u.firstName} ${u.lastName} (${u.email}) - ${u.role}`);
  }

  console.log('\nSeed complete!');
}

main()
  .catch(e => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
