const { spawnSync } = require('child_process');

async function tableExists(prisma, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS tableCount
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName}
  `;
  return Number(rows[0]?.tableCount || 0) > 0;
}

async function columnExists(prisma, tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS columnCount
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName} AND COLUMN_NAME = ${columnName}
  `;
  return Number(rows[0]?.columnCount || 0) > 0;
}

async function ensureColumn(prisma, tableName, columnName, definition) {
  if (!(await tableExists(prisma, tableName))) return;
  if (await columnExists(prisma, tableName, columnName)) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function ensureRuntimeColumns(prisma) {
  await ensureColumn(prisma, 'User', 'reminderEmails', 'JSON NULL');
  await ensureColumn(prisma, 'MyCompanyProfile', 'reminderEmails', 'JSON NULL');
}

async function ensureSecuritySchema(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`User\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`email\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`passwordHash\` VARCHAR(255) NOT NULL,
      \`role\` VARCHAR(32) NOT NULL DEFAULT 'USER',
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Active',
      \`reminderEmails\` JSON NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
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
    CREATE TABLE IF NOT EXISTS \`MyCompanyProfile\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`tenantKey\` VARCHAR(191) NOT NULL DEFAULT 'default',
      \`deletedAt\` DATETIME(3) NULL,
      \`companyName\` VARCHAR(191) NOT NULL,
      \`address\` VARCHAR(191) NULL,
      \`gstNumber\` VARCHAR(191) NULL,
      \`panNumber\` VARCHAR(191) NULL,
      \`bankName\` VARCHAR(191) NULL,
      \`accountNumber\` VARCHAR(191) NULL,
      \`ifscCode\` VARCHAR(191) NULL,
      \`signatoryRole\` VARCHAR(191) NULL,
      \`reminderEmails\` JSON NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`MyCompanyProfile_tenantKey_key\` (\`tenantKey\`)
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

async function ensureDatabaseSchema(prisma) {
  if (process.env.SKIP_DB_PUSH === 'true') return;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  if (await tableExists(prisma, 'User')) {
    await ensureRuntimeColumns(prisma);
    return;
  }

  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    const message = result.error?.message || result.stderr || result.stdout || 'Prisma schema sync failed.';
    console.warn(`Prisma db push skipped during startup: ${message.trim()}`);
    await ensureSecuritySchema(prisma);
    await ensureRuntimeColumns(prisma);
    return;
  }

  await ensureRuntimeColumns(prisma);
  if (result.stdout) console.log(result.stdout.trim());
}

module.exports = { ensureDatabaseSchema, ensureSecuritySchema, ensureRuntimeColumns };
