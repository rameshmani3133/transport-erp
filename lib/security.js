const crypto = require('crypto');

const TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_HOURS || 12) * 60 * 60 * 1000;
const SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'dev-change-this-auth-secret';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('base64url');
    crypto.scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 }, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`scrypt$${salt}$${derivedKey.toString('base64url')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    const [scheme, salt, hash] = String(storedHash || '').split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return resolve(false);

    crypto.scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 }, (error, derivedKey) => {
      if (error) return reject(error);
      const expected = Buffer.from(hash, 'base64url');
      if (expected.length !== derivedKey.length) return resolve(false);
      resolve(crypto.timingSafeEqual(expected, derivedKey));
    });
  });
}

function createToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function parseToken(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature || sign(body) !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sanitizeUser(user) {
  if (!user) return null;
  const companies = (user.companyAccess || [])
    .filter(access => !access.deletedAt)
    .map(access => access.tenantKey);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    companies,
  };
}

function isSuperAdmin(user) {
  return user?.role === 'SUPERADMIN';
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Superadmin access required.' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  parseToken,
  sanitizeUser,
  isSuperAdmin,
  requireSuperAdmin,
};
