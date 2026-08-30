const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { hashPassword, verifyPassword, createToken, parseToken, sanitizeUser } = require('../lib/security');
const { normalizeTenantKey } = require('./tenant');

const router = express.Router();
const prisma = new PrismaClient();


async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = parseToken(token);
  if (!payload) return res.status(401).json({ error: 'Login required.' });
  const user = await prisma.user.findFirst({
    where: { id: Number(payload.sub), status: 'Active', deletedAt: null },
    include: { companyAccess: { where: { deletedAt: null } } },
  });
  if (!user) return res.status(401).json({ error: 'User is inactive or no longer exists.' });
  req.user = sanitizeUser(user);
  next();
}
async function ensureSuperAdmin() {
  const count = await prisma.user.count({ where: { deletedAt: null } });
  if (count > 0) return;

  if (!process.env.SUPERADMIN_EMAIL || !process.env.SUPERADMIN_PASSWORD) {
    throw new Error('SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set before first startup.');
  }

  const email = process.env.SUPERADMIN_EMAIL.trim().toLowerCase();
  const name = process.env.SUPERADMIN_NAME || 'Super Admin';
  const tenantKey = normalizeTenantKey(process.env.SUPERADMIN_TENANT || 'default');

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: 'SUPERADMIN',
      passwordHash: await hashPassword(process.env.SUPERADMIN_PASSWORD),
      companyAccess: { create: { tenantKey } },
    },
  });

  const existingProfile = await prisma.myCompanyProfile.findFirst({ where: { tenantKey, deletedAt: null } });
  if (!existingProfile) {
    await prisma.myCompanyProfile.create({ data: { tenantKey, companyName: 'Default Company' } });
  }

  console.log(`Superadmin created: ${user.email}`);
}

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null, status: 'Active' },
    include: { companyAccess: { where: { deletedAt: null } } },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.json({ token: createToken(user), user: sanitizeUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = { router, ensureSuperAdmin };
