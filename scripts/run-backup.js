require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { runBackup } = require('../lib/backup');

const prisma = new PrismaClient();

runBackup(prisma, 'manual-script')
  .then(run => {
    console.log(`Backup completed: ${run.localPath}`);
    if (run.cloudPath) console.log(`Cloud copy: ${run.cloudPath}`);
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
