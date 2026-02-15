// =============================================================================
// DATABASE CONNECTION
// =============================================================================
// This file creates ONE connection to your PostgreSQL database and reuses it.
// Every API route that needs the database imports this file.
//
// Why a singleton? Without it, every time someone loads a page, a new
// connection opens. Eventually you'd run out and the database would refuse
// new connections — like trying to make 100 phone calls on one phone line.
// =============================================================================

const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
  // In production: one client, period
  prisma = new PrismaClient();
} else {
  // In development: reuse across hot reloads (Next.js restarts a lot while coding)
  if (!global.__prisma) {
    global.__prisma = new PrismaClient();
  }
  prisma = global.__prisma;
}

module.exports = prisma;
