const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { hashPassword, sanitizeUser, requireSuperAdmin } = require('../lib/security');
const { normalizeTenantKey } = require('./tenant');
const { runBackup } = require('../lib/backup');
const { toRequiredInt, text } = require('../lib/coerce');
const fs = require('fs');
const path = require('path');

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

function csvEscape(value) {
  if (value == null) return '';
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function sendCsv(res, fileName, headers, rows) {
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(','))
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csv);
}

function safeBackupPath(filePath) {
  if (!filePath) return null;
  const allowedRoots = [
    process.env.BACKUP_LOCAL_DIR,
    process.env.BACKUP_CLOUD_DIR,
    path.join(__dirname, '..', 'backups', 'local'),
    path.join(__dirname, '..', 'backups', 'cloud'),
  ].filter(Boolean).map(item => path.resolve(item).toLowerCase());
  const resolved = path.resolve(filePath);
  return allowedRoots.some(root => resolved.toLowerCase().startsWith(root + path.sep)) ? resolved : null;
}

router.get('/audit-logs', async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { id: 'desc' },
    take: 200,
  });
  res.json(logs);
});

router.get('/audit-logs/export', async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { id: 'desc' },
  });
  sendCsv(res, `audit-logs-${Date.now()}.csv`, ['id', 'createdAt', 'user', 'tenantKey', 'action', 'entity', 'entityId', 'ipAddress', 'details'], logs.map(log => ({
    id: log.id,
    createdAt: log.createdAt,
    user: log.user?.email || 'system',
    tenantKey: log.tenantKey || '',
    action: log.action,
    entity: log.entity || '',
    entityId: log.entityId || '',
    ipAddress: log.ipAddress || '',
    details: log.details || '',
  })));
});

router.put('/audit-logs/:id', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'Audit log');
    let details = req.body.details;
    if (typeof details === 'string') {
      details = details.trim() ? JSON.parse(details) : null;
    }
    const log = await prisma.auditLog.update({
      where: { id },
      data: {
        action: text(req.body.action),
        tenantKey: text(req.body.tenantKey, null) || null,
        entity: text(req.body.entity, null) || null,
        entityId: text(req.body.entityId, null) || null,
        ipAddress: text(req.body.ipAddress, null) || null,
        details,
      },
      include: { user: { select: { email: true, name: true } } },
    });
    res.json(log);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to update audit log.' });
  }
});

router.delete('/audit-logs/:id', async (req, res) => {
  try {
    await prisma.auditLog.delete({ where: { id: toRequiredInt(req.params.id, 'Audit log') } });
    res.json({ message: 'Audit log deleted.' });
  } catch (error) {
    res.status(400).json({ error: 'Failed to delete audit log.' });
  }
});

router.get('/backups', async (req, res) => {
  const runs = await prisma.backupRun.findMany({ orderBy: { id: 'desc' }, take: 50 });
  res.json(runs);
});

router.get('/backups/export', async (req, res) => {
  const runs = await prisma.backupRun.findMany({ orderBy: { id: 'desc' } });
  sendCsv(res, `backup-runs-${Date.now()}.csv`, ['id', 'createdAt', 'status', 'localPath', 'cloudPath', 'message'], runs);
});

router.post('/backups/run', async (req, res) => {
  const backup = await runBackup(prisma, 'manual');
  res.json(backup);
});

router.put('/backups/:id', async (req, res) => {
  try {
    const run = await prisma.backupRun.update({
      where: { id: toRequiredInt(req.params.id, 'Backup run') },
      data: {
        status: text(req.body.status, 'Success') || 'Success',
        message: text(req.body.message, null) || null,
      },
    });
    res.json(run);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to update backup.' });
  }
});

router.delete('/backups/:id', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'Backup run');
    const run = await prisma.backupRun.findUnique({ where: { id } });
    if (!run) return res.status(404).json({ error: 'Backup not found.' });

    for (const candidate of [run.localPath, run.cloudPath]) {
      const filePath = safeBackupPath(candidate);
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.backupRun.delete({ where: { id } });
    res.json({ message: 'Backup deleted.' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to delete backup.' });
  }
});

module.exports = router;
