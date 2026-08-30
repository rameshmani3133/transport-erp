const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const rootDir = path.resolve(__dirname, '..');
const localBackupDir = process.env.BACKUP_LOCAL_DIR || path.join(rootDir, 'backups', 'local');
const cloudBackupDir = process.env.BACKUP_CLOUD_DIR || '';
const cloudCommand = process.env.BACKUP_CLOUD_COMMAND || '';
const backupTime = process.env.BACKUP_DAILY_TIME || '02:00';

function stamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseMysqlUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port || '3306',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false });
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) return resolve();
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function writeMysqlDump(outputPath) {
  const db = parseMysqlUrl(process.env.DATABASE_URL);
  const args = [
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--user=${db.user}`,
    `--result-file=${outputPath}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    db.database,
  ];
  await run('mysqldump', args, { env: { ...process.env, MYSQL_PWD: db.password } });
}

async function writeJsonFallback(prisma, outputPath) {
  const tables = await prisma.$queryRaw`
    SELECT TABLE_NAME AS tableName
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
  `;
  const data = {};
  for (const row of tables) {
    const tableName = row.tableName;
    data[tableName] = await prisma.$queryRawUnsafe(`SELECT * FROM \`${tableName}\``);
  }
  fs.writeFileSync(outputPath, JSON.stringify({ createdAt: new Date().toISOString(), data }, null, 2));
}

async function copyToCloud(localPath) {
  if (cloudBackupDir) {
    ensureDir(cloudBackupDir);
    const cloudPath = path.join(cloudBackupDir, path.basename(localPath));
    fs.copyFileSync(localPath, cloudPath);
    return cloudPath;
  }

  if (cloudCommand) {
    await run(cloudCommand, [localPath], { shell: true });
    return `command:${cloudCommand}`;
  }

  return null;
}

async function runBackup(prisma, reason = 'scheduled') {
  ensureDir(localBackupDir);
  const sqlPath = path.join(localBackupDir, `transport-erp-${stamp()}.sql`);
  const jsonPath = path.join(localBackupDir, `transport-erp-${stamp()}.json`);
  let localPath = sqlPath;
  let message = `${reason} SQL backup completed.`;

  try {
    await writeMysqlDump(sqlPath);
  } catch (error) {
    localPath = jsonPath;
    await writeJsonFallback(prisma, jsonPath);
    message = `${reason} JSON backup completed because mysqldump was unavailable: ${error.message}`;
  }

  const cloudPath = await copyToCloud(localPath);
  const run = await prisma.backupRun.create({
    data: { status: 'Success', localPath, cloudPath, message },
  });
  return run;
}

function scheduleDailyBackup(prisma) {
  const [hourRaw, minuteRaw] = backupTime.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return;

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    setTimeout(async () => {
      try {
        await runBackup(prisma, 'scheduled');
      } catch (error) {
        console.error('Daily backup failed:', error);
        try {
          await prisma.backupRun.create({ data: { status: 'Failed', message: error.message } });
        } catch {}
      } finally {
        scheduleNext();
      }
    }, next.getTime() - now.getTime());
  };

  scheduleNext();
}

module.exports = { runBackup, scheduleDailyBackup };
