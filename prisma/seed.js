// =============================================================================
// SEED SCRIPT — Creates the first user in the database
// =============================================================================
// Run this once after setting up the database:
//   node prisma/seed.js
//
// This creates your admin account so projects can be saved.
// =============================================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Check if any users exist already
  const userCount = await prisma.user.count();
  
  if (userCount > 0) {
    console.log('Users already exist. Skipping seed.');
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } });
    console.log('Existing users:', users);
    return;
  }

  // Create the admin user
  const admin = await prisma.user.create({
    data: {
      email: 'tdawson@bergerinc.com',
      password: 'temporary', // We'll add proper password hashing when we build auth
      name: 'Todd Dawson',
      role: 'ADMIN',
    }
  });

  console.log('Created admin user:', { id: admin.id, name: admin.name, email: admin.email, role: admin.role });
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
