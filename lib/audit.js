async function writeAudit(prisma, req, action, entity, entityId, details = null) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        tenantKey: req.tenantKey || null,
        action,
        entity,
        entityId: entityId == null ? null : String(entityId),
        details,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
      },
    });
  } catch (error) {
    console.error('Audit log write failed:', error.message);
  }
}

function auditMiddleware(prisma) {
  return (req, res, next) => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();

    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      void writeAudit(prisma, req, `${method} ${req.path}`, null, req.params?.id || null, {
        body: redact(req.body),
      });
    });
    next();
  };
}

function redact(value) {
  if (!value || typeof value !== 'object') return value;
  const output = Array.isArray(value) ? [] : {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|token|secret/i.test(key)) {
      output[key] = '[redacted]';
    } else if (item && typeof item === 'object') {
      output[key] = redact(item);
    } else {
      output[key] = item;
    }
  }
  return output;
}

module.exports = { writeAudit, auditMiddleware };
