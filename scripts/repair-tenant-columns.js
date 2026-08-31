const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const tables = [
  'Vehicle',
  'Driver',
  'ClientCompany',
  'BillingLocation',
  'RouteMaster',
  'Trip',
  'Invoice',
  'InvoicePayment',
  'Account',
  'LedgerEntry',
  'Diesel',
  'VendorSettlement',
  'DriverSettlement',
  'MyCompanyProfile',
];

async function columnExists(tableName) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS columnCount
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND COLUMN_NAME = 'tenantKey'
  `;

  return Number(rows[0].columnCount) > 0;
}

async function tableExists(tableName) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS tableCount
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
  `;

  return Number(rows[0].tableCount) > 0;
}

async function main() {
  for (const tableName of tables) {
    if (!(await tableExists(tableName))) {
      console.log(`Skipped ${tableName}: table does not exist`);
      continue;
    }

    if (await columnExists(tableName)) {
      console.log(`Skipped ${tableName}: tenantKey already exists`);
      continue;
    }

    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`tenantKey\` VARCHAR(191) NOT NULL DEFAULT 'default'`
    );
    console.log(`Added tenantKey to ${tableName}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
