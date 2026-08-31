const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../lib/security');

const prisma = new PrismaClient();

const softDeleteTables = [
  'Vehicle', 'Driver', 'ClientCompany', 'BillingLocation', 'RouteMaster', 'Trip',
  'Invoice', 'InvoicePayment', 'Account', 'LedgerEntry', 'Diesel', 'VendorSettlement',
  'DriverSettlement', 'MyCompanyProfile'
];

async function tableExists(tableName) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS tableCount
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName}
  `;
  return Number(rows[0].tableCount) > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS columnCount
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName} AND COLUMN_NAME = ${columnName}
  `;
  return Number(rows[0].columnCount) > 0;
}

async function addColumn(tableName, definition) {
  const columnName = definition.split('`')[1];
  if (!(await tableExists(tableName))) return console.log(`Skipped ${tableName}: table does not exist`);
  if (await columnExists(tableName, columnName)) return console.log(`Skipped ${tableName}.${columnName}: already exists`);
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  console.log(`Added ${tableName}.${columnName}`);
}

async function createTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`User\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`email\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`passwordHash\` VARCHAR(255) NOT NULL,
      \`role\` VARCHAR(32) NOT NULL DEFAULT 'USER',
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Active',
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`deletedAt\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`User_email_key\` (\`email\`)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`UserCompanyAccess\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`userId\` INT NOT NULL,
      \`tenantKey\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`deletedAt\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`UserCompanyAccess_userId_tenantKey_key\` (\`userId\`, \`tenantKey\`),
      CONSTRAINT \`UserCompanyAccess_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`AuditLog\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`userId\` INT NULL,
      \`tenantKey\` VARCHAR(191) NULL,
      \`action\` VARCHAR(191) NOT NULL,
      \`entity\` VARCHAR(191) NULL,
      \`entityId\` VARCHAR(191) NULL,
      \`details\` JSON NULL,
      \`ipAddress\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      CONSTRAINT \`AuditLog_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`BackupRun\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`status\` VARCHAR(32) NOT NULL,
      \`localPath\` VARCHAR(1024) NULL,
      \`cloudPath\` VARCHAR(1024) NULL,
      \`message\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    )
  `);
}

async function seedSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) throw new Error('SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD are required.');

  const existing = await prisma.$queryRawUnsafe('SELECT id FROM `User` WHERE email = ? AND deletedAt IS NULL LIMIT 1', email.toLowerCase());
  if (existing.length) return console.log(`Skipped superadmin seed: ${email} already exists`);

  await prisma.$executeRawUnsafe(
    'INSERT INTO `User` (`email`, `name`, `passwordHash`, `role`, `status`) VALUES (?, ?, ?, ?, ?)',
    email.toLowerCase(),
    process.env.SUPERADMIN_NAME || 'Super Admin',
    await hashPassword(password),
    'SUPERADMIN',
    'Active'
  );
  const rows = await prisma.$queryRawUnsafe('SELECT id FROM `User` WHERE email = ? LIMIT 1', email.toLowerCase());
  const userId = rows[0].id;
  const tenantKey = process.env.SUPERADMIN_TENANT || 'default';
  await prisma.$executeRawUnsafe('INSERT IGNORE INTO `UserCompanyAccess` (`userId`, `tenantKey`) VALUES (?, ?)', userId, tenantKey);
  await prisma.$executeRawUnsafe('INSERT IGNORE INTO `MyCompanyProfile` (`tenantKey`, `companyName`) VALUES (?, ?)', tenantKey, 'Default Company');
  console.log(`Seeded superadmin: ${email}`);
}

async function main() {
  await createTables();
  for (const table of softDeleteTables) {
    await addColumn(table, '`deletedAt` DATETIME(3) NULL');
  }
  await addColumn('Trip', '`clientAdvanceAccountId` INT NULL');
  await addColumn('Trip', '`clientAdvanceClientAccountId` INT NULL');
  await addColumn('Trip', '`clientAdvanceDate` DATETIME(3) NULL');
  await addColumn('Trip', '`clientAdvanceAmount` DOUBLE NOT NULL DEFAULT 0');
  await seedSuperAdmin();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});

