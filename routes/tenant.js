function getTenantKey(req) {
    const rawKey = req.headers['x-tenant-key'] || req.query.tenantKey || 'default';
    const key = String(rawKey).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    return key || 'default';
}

function tenantMiddleware(req, res, next) {
    req.tenantKey = getTenantKey(req);
    next();
}

function withTenant(req, where = {}) {
    return { ...where, tenantKey: req.tenantKey };
}

module.exports = { tenantMiddleware, withTenant };
