const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { hashPassword, sanitizeUser, requireSuperAdmin } = require('../lib/security');
const { normalizeTenantKey } = require('./tenant');
const { runBackup } = require('../lib/backup');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireSuperAdmin);

router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: { companyAccess: { where: { deletedAt: null } } },
    orderBy: { id: 'desc' },
  });
  res.json(users.map(sanitizeUser));
});

router.post('/users', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const companyKeys = Array.isArray(req.body.companies) ? req.body.companies.map(normalizeTenantKey) : [];
  if (!email || !req.body.name || password.length < 10) {
    return res.status(400).json({ error: 'Name, email, and a password of at least 10 characters are required.' });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: req.body.name,
      role: req.body.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'USER',
      status: req.body.status || 'Active',
      passwordHash: await hashPassword(password),
      companyAccess: { create: companyKeys.map(tenantKey => ({ tenantKey })) },
    },
    include: { companyAccess: { where: { deletedAt: null } } },
  });
  res.json(sanitizeUser(user));
});

router.put('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const companyKeys = Array.isArray(req.body.companies) ? [...new Set(req.body.companies.map(normalizeTenantKey))] : [];
  const data = {
    name: req.body.name,
    role: req.body.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'USER',
    status: req.body.status || 'Active',
  };
  if (req.body.password) {
    if (String(req.body.password).length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    data.passwordHash = await hashPassword(req.body.password);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data });
    await tx.userCompanyAccess.updateMany({ where: { userId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    for (const tenantKey of companyKeys) {
      const existing = await tx.userCompanyAccess.findFirst({ where: { userId: id, tenantKey } });
      if (existing) {
        await tx.userCompanyAccess.update({ where: { id: existing.id }, data: { deletedAt: null } });
      } else {
        await tx.userCompanyAccess.create({ data: { userId: id, tenantKey } });
      }
    }
  });

  const user = await prisma.user.findFirst({ where: { id }, include: { companyAccess: { where: { deletedAt: null } } } });
  res.json(sanitizeUser(user));
});

router.delete('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'Inactive' } });
  res.json({ message: 'User deleted.' });
});

router.get('/audit-logs', async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { id: 'desc' },
    take: 200,
  });
  res.json(logs);
});

router.get('/backups', async (req, res) => {
  const runs = await prisma.backupRun.findMany({ orderBy: { id: 'desc' }, take: 50 });
  res.json(runs);
});

router.post('/backups/run', async (req, res) => {
  const backup = await runBackup(prisma, 'manual');
  res.json(backup);
});

module.exports = router;
