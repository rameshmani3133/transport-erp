const { spawnSync } = require('child_process');

async function tableExists(prisma, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS tableCount
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName}
  `;
  return Number(rows[0]?.tableCount || 0) > 0;
}

async function ensureDatabaseSchema(prisma) {
  if (process.env.SKIP_DB_PUSH === 'true') return;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  if (await tableExists(prisma, 'User')) return;

  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    const message = result.error?.message || result.stderr || result.stdout || 'Prisma schema sync failed.';
    throw new Error(message.trim());
  }

  if (result.stdout) console.log(result.stdout.trim());
}

module.exports = { ensureDatabaseSchema };
