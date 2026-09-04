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
  await ensureColumn(prisma, 'Trip', 'otherDeduction', 'DOUBLE NOT NULL DEFAULT 0');
  await ensureColumn(prisma, 'Trip', 'remarks', 'TEXT NULL');
  await ensureColumn(prisma, 'User', 'reminderEmails', 'JSON NULL');
  await ensureColumn(prisma, 'MyCompanyProfile', 'reminderEmails', 'JSON NULL');
  await ensureColumn(prisma, 'MyCompanyProfile', 'phoneNumber', 'VARCHAR(64) NULL');
  await ensureColumn(prisma, 'MyCompanyProfile', 'email', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'MyCompanyProfile', 'beneficiaryName', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'MyCompanyProfile', 'bankBranch', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'MyCompanyProfile', 'signatoryName', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'MyCompanyProfile', 'rule48Declaration', 'TEXT NULL');
  await ensureColumn(prisma, 'MyCompanyProfile', 'gtaDeclaration', 'TEXT NULL');
  await ensureColumn(prisma, 'Invoice', 'description', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'Invoice', 'sacCode', 'VARCHAR(64) NULL');
  await ensureColumn(prisma, 'Invoice', 'vendorCode', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'Invoice', 'poMigo', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'BillingLocation', 'stateOfficeCode', 'VARCHAR(64) NULL');
  await ensureColumn(prisma, 'Invoice', 'stateOfficeCode', 'VARCHAR(64) NULL');
  await ensureColumn(prisma, 'Invoice', 'invoiceFormat', "VARCHAR(64) NOT NULL DEFAULT 'Standard'");
  await ensureColumn(prisma, 'Invoice', 'periodFrom', 'DATETIME(3) NULL');
  await ensureColumn(prisma, 'Invoice', 'periodTo', 'DATETIME(3) NULL');
  await ensureColumn(prisma, 'Invoice', 'transportationMode', 'VARCHAR(64) NULL');
  await ensureColumn(prisma, 'Invoice', 'vehicleNo', 'VARCHAR(64) NULL');
  await ensureColumn(prisma, 'Invoice', 'productService', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'Invoice', 'gstType', 'VARCHAR(32) NULL');
  await ensureColumn(prisma, 'Invoice', 'gstPercent', 'DOUBLE NOT NULL DEFAULT 0');
  await ensureColumn(prisma, 'Invoice', 'declaration', 'TEXT NULL');
  await ensureColumn(prisma, 'ClientCompany', 'vendorCode', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'Invoice', 'showStatus', 'BOOLEAN NOT NULL DEFAULT false');
  await ensureColumn(prisma, 'Invoice', 'showRoundOff', 'BOOLEAN NOT NULL DEFAULT true');
  if (await tableExists(prisma, 'BillingLocation')) {
    await prisma.$executeRawUnsafe("UPDATE `BillingLocation` SET `invoiceFormat` = 'BPCL INVOICE' WHERE `invoiceFormat` = 'LPG Bill'");
  }
  if (await tableExists(prisma, 'Invoice')) {
    await prisma.$executeRawUnsafe("UPDATE `Invoice` SET `invoiceFormat` = 'BPCL INVOICE' WHERE `invoiceFormat` = 'LPG Bill'");
  }
  await ensureColumn(prisma, 'Loan', 'lenderBankName', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'Loan', 'lenderAccountNo', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'Loan', 'lenderIfscCode', 'VARCHAR(64) NULL');
  await ensureColumn(prisma, 'Loan', 'lenderBranch', 'VARCHAR(191) NULL');
  await ensureColumn(prisma, 'Loan', 'paymentStatus', "VARCHAR(32) NOT NULL DEFAULT 'Due'");
  await ensureColumn(prisma, 'Loan', 'paidDate', 'DATETIME(3) NULL');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`RecurringBill\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`tenantKey\` VARCHAR(191) NOT NULL DEFAULT 'default',
      \`deletedAt\` DATETIME(3) NULL,
      \`category\` VARCHAR(64) NOT NULL,
      \`billName\` VARCHAR(191) NOT NULL,
      \`providerName\` VARCHAR(191) NULL,
      \`consumerNumber\` VARCHAR(191) NULL,
      \`amount\` DOUBLE NOT NULL,
      \`dueDay\` INT NOT NULL,
      \`nextDueDate\` DATETIME(3) NOT NULL,
      \`paymentStatus\` VARCHAR(32) NOT NULL DEFAULT 'Due',
      \`lastPaidDate\` DATETIME(3) NULL,
      \`reminderEnabled\` BOOLEAN NOT NULL DEFAULT true,
      \`startDate\` DATETIME(3) NULL,
      \`endDate\` DATETIME(3) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Active',
      \`remarks\` TEXT NULL,
      \`expenseAccountId\` INT NULL,
      \`payableAccountId\` INT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`RecurringBill_tenantKey_nextDueDate_idx\` (\`tenantKey\`, \`nextDueDate\`)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`RecurringBillPayment\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`tenantKey\` VARCHAR(191) NOT NULL DEFAULT 'default',
      \`deletedAt\` DATETIME(3) NULL,
      \`recurringBillId\` INT NOT NULL,
      \`dueDate\` DATETIME(3) NOT NULL,
      \`paidDate\` DATETIME(3) NOT NULL,
      \`amount\` DOUBLE NOT NULL,
      \`paymentMode\` VARCHAR(64) NULL,
      \`referenceNumber\` VARCHAR(191) NULL,
      \`remarks\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`RecurringBillPayment_tenantKey_recurringBillId_idx\` (\`tenantKey\`, \`recurringBillId\`),
      CONSTRAINT \`RecurringBillPayment_recurringBillId_fkey\` FOREIGN KEY (\`recurringBillId\`) REFERENCES \`RecurringBill\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await ensureColumn(prisma, 'RecurringBill', 'expenseAccountId', 'INT NULL');
  await ensureColumn(prisma, 'RecurringBill', 'payableAccountId', 'INT NULL');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`Voucher\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`tenantKey\` VARCHAR(191) NOT NULL DEFAULT 'default',
      \`deletedAt\` DATETIME(3) NULL,
      \`voucherNo\` VARCHAR(191) NOT NULL,
      \`requestKey\` VARCHAR(191) NULL,
      \`voucherType\` VARCHAR(64) NOT NULL,
      \`date\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Posted',
      \`totalAmount\` DOUBLE NOT NULL,
      \`paymentMode\` VARCHAR(64) NULL,
      \`referenceNo\` VARCHAR(191) NULL,
      \`narration\` TEXT NOT NULL,
      \`remarks\` TEXT NULL,
      \`sourceType\` VARCHAR(64) NULL,
      \`sourceId\` INT NULL,
      \`metadata\` JSON NULL,
      \`reversalOfId\` INT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`Voucher_tenantKey_voucherNo_key\` (\`tenantKey\`, \`voucherNo\`),
      UNIQUE KEY \`Voucher_tenantKey_requestKey_key\` (\`tenantKey\`, \`requestKey\`),
      INDEX \`Voucher_tenantKey_date_idx\` (\`tenantKey\`, \`date\`),
      INDEX \`Voucher_tenantKey_voucherType_idx\` (\`tenantKey\`, \`voucherType\`)
    )
  `);
  await ensureColumn(prisma, 'Voucher', 'requestKey', 'VARCHAR(191) NULL');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`VoucherLine\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`tenantKey\` VARCHAR(191) NOT NULL DEFAULT 'default',
      \`voucherId\` INT NOT NULL,
      \`accountId\` INT NOT NULL,
      \`type\` VARCHAR(8) NOT NULL,
      \`amount\` DOUBLE NOT NULL,
      \`description\` TEXT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`VoucherLine_tenantKey_voucherId_idx\` (\`tenantKey\`, \`voucherId\`),
      INDEX \`VoucherLine_tenantKey_accountId_idx\` (\`tenantKey\`, \`accountId\`),
      CONSTRAINT \`VoucherLine_voucherId_fkey\` FOREIGN KEY (\`voucherId\`) REFERENCES \`Voucher\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT \`VoucherLine_accountId_fkey\` FOREIGN KEY (\`accountId\`) REFERENCES \`Account\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await ensureColumn(prisma, 'LedgerEntry', 'voucherId', 'INT NULL');
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
      \`phoneNumber\` VARCHAR(64) NULL,
      \`email\` VARCHAR(191) NULL,
      \`beneficiaryName\` VARCHAR(191) NULL,
      \`bankBranch\` VARCHAR(191) NULL,
      \`signatoryName\` VARCHAR(191) NULL,
      \`rule48Declaration\` TEXT NULL,
      \`gtaDeclaration\` TEXT NULL,
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
