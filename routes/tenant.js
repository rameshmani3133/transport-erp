const { PrismaClient } = require('@prisma/client');
const { parseToken, sanitizeUser, isSuperAdmin } = require('../lib/security');

const prisma = new PrismaClient();

function normalizeTenantKey(value) {
  const key = String(value || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return key || 'default';
}

function getTenantKey(req) {
  return normalizeTenantKey(req.headers['x-tenant-key'] || req.query.tenantKey || 'default');
}

async function authMiddleware(req, res, next) {
  if (req.path.startsWith('/auth/')) return next();

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

function tenantMiddleware(req, res, next) {
  req.tenantKey = getTenantKey(req);

  if (!req.user || isSuperAdmin(req.user)) return next();
  if (req.user.companies.includes(req.tenantKey)) return next();

  return res.status(403).json({ error: 'You are not assigned to this company.' });
}

function withTenant(req, where = {}) {
  return { ...where, tenantKey: req.tenantKey, deletedAt: null };
}

function onlyActive(where = {}) {
  return { ...where, deletedAt: null };
}

module.exports = { authMiddleware, tenantMiddleware, withTenant, onlyActive, normalizeTenantKey };
