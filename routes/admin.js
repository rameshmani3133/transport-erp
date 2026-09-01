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

function cleanEmails(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map(item => String(item || '').trim().toLowerCase()).filter(item => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))];
}

router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { companyAccess: { where: { deletedAt: null } } },
      orderBy: { id: 'desc' },
    });
    res.json(users.map(sanitizeUser));
  } catch (error) {
    console.error('List users failed:', error);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

router.get('/users/deleted', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: { not: null } },
      include: { companyAccess: { where: { deletedAt: null } } },
      orderBy: { deletedAt: 'desc' },
    });
    res.json(users.map(user => ({ ...sanitizeUser(user), deletedAt: user.deletedAt })));
  } catch (error) {
    console.error('List deleted users failed:', error);
    res.status(500).json({ error: 'Failed to load deleted users.' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');
    const companyKeys = Array.isArray(req.body.companies)
      ? [...new Set(req.body.companies.map(normalizeTenantKey))]
      : [];

    if (!email || !name || password.length < 10) {
      return res.status(400).json({ error: 'Name, email, and a password of at least 10 characters are required.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const message = existing.deletedAt
        ? 'A deleted user already uses this email. Restore the user from the recycle bin or permanently delete it first.'
        : 'A user with this email already exists.';
      return res.status(409).json({ error: message });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: req.body.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'USER',
        status: req.body.status === 'Inactive' ? 'Inactive' : 'Active',
        reminderEmails: cleanEmails(req.body.reminderEmails),
        passwordHash: await hashPassword(password),
        companyAccess: { create: companyKeys.map(tenantKey => ({ tenantKey })) },
      },
      include: { companyAccess: { where: { deletedAt: null } } },
    });
    res.status(201).json(sanitizeUser(user));
  } catch (error) {
    console.error('Create user failed:', error);
    if (error.code === 'P2002') return res.status(409).json({ error: 'A user with this email already exists.' });
    res.status(500).json({ error: 'Failed to create user.' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'User');
    const userExists = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!userExists) return res.status(404).json({ error: 'User not found.' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    const companyKeys = Array.isArray(req.body.companies)
      ? [...new Set(req.body.companies.map(normalizeTenantKey))]
      : [];
    const data = {
      name,
      role: req.body.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'USER',
      status: req.body.status === 'Inactive' ? 'Inactive' : 'Active',
      reminderEmails: cleanEmails(req.body.reminderEmails),
    };
    if (req.body.password) {
      if (String(req.body.password).length < 10) {
        return res.status(400).json({ error: 'Password must be at least 10 characters.' });
      }
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

    const user = await prisma.user.findUnique({
      where: { id },
      include: { companyAccess: { where: { deletedAt: null } } },
    });
    res.json(sanitizeUser(user));
  } catch (error) {
    console.error('Update user failed:', error);
    res.status(400).json({ error: error.message || 'Failed to update user.' });
  }
});

router.post('/users/:id/reminder-emails', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'User');
    const email = cleanEmails([req.body.email])[0];
    if (!email) return res.status(400).json({ error: 'Valid email is required.' });

    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const reminderEmails = cleanEmails([...(Array.isArray(user.reminderEmails) ? user.reminderEmails : []), email]);
    const updated = await prisma.user.update({
      where: { id },
      data: { reminderEmails },
      include: { companyAccess: { where: { deletedAt: null } } },
    });
    res.json(sanitizeUser(updated));
  } catch (error) {
    console.error('Add user reminder email failed:', error);
    res.status(400).json({ error: error.message || 'Failed to add user reminder email.' });
  }
});

router.delete('/users/:id/reminder-emails/:email', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'User');
    const email = cleanEmails([decodeURIComponent(req.params.email)])[0];
    if (!email) return res.status(400).json({ error: 'Valid email is required.' });

    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const reminderEmails = cleanEmails(user.reminderEmails).filter(item => item !== email);
    const updated = await prisma.user.update({
      where: { id },
      data: { reminderEmails },
      include: { companyAccess: { where: { deletedAt: null } } },
    });
    res.json(sanitizeUser(updated));
  } catch (error) {
    console.error('Remove user reminder email failed:', error);
    res.status(400).json({ error: error.message || 'Failed to remove user reminder email.' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'User');
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const result = await prisma.user.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), status: 'Inactive' },
    });
    if (!result.count) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'User moved to recycle bin.' });
  } catch (error) {
    console.error('Delete user failed:', error);
    res.status(400).json({ error: error.message || 'Failed to delete user.' });
  }
});

router.patch('/users/:id/restore', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'User');
    const deletedUser = await prisma.user.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!deletedUser) return res.status(404).json({ error: 'Deleted user not found.' });

    const user = await prisma.user.update({
      where: { id },
      data: { deletedAt: null, status: 'Active' },
      include: { companyAccess: { where: { deletedAt: null } } },
    });
    res.json(sanitizeUser(user));
  } catch (error) {
    console.error('Restore user failed:', error);
    res.status(400).json({ error: error.message || 'Failed to restore user.' });
  }
});

router.delete('/users/:id/permanent', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'User');
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot permanently delete your own account.' });
    const deletedUser = await prisma.user.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!deletedUser) return res.status(404).json({ error: 'Deleted user not found.' });

    await prisma.$transaction(async (tx) => {
      await tx.userCompanyAccess.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
    res.json({ message: 'User permanently deleted.' });
  } catch (error) {
    console.error('Permanent user delete failed:', error);
    res.status(400).json({ error: error.message || 'Failed to permanently delete user.' });
  }
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
