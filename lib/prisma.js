const { PrismaClient } = require('@prisma/client');

// Keep one shared connection pool for the complete API process.
const prisma = globalThis.__transportErpPrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__transportErpPrisma = prisma;
}

module.exports = prisma;
