const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { isSuperAdmin } = require('../lib/security');
const { normalizeTenantKey } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/all', async (req, res) => {
    try {
        const where = isSuperAdmin(req.user)
            ? { deletedAt: null }
            : { deletedAt: null, tenantKey: { in: req.user.companies } };
        const profiles = await prisma.myCompanyProfile.findMany({
            where,
            orderBy: { companyName: 'asc' }
        });
        res.json(profiles);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch company profiles." });
    }
});

router.get('/', async (req, res) => {
    try {
        const profile = await prisma.myCompanyProfile.findFirst({
            where: { tenantKey: req.tenantKey, deletedAt: null }
        });
        res.json(profile || {});
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch company profile." });
    }
});

router.post('/', async (req, res) => {
    try {
        const requestedTenant = req.body.tenantKey ? normalizeTenantKey(req.body.tenantKey) : req.tenantKey;
        const isCreatingDifferentTenant = requestedTenant !== req.tenantKey;
        if (isCreatingDifferentTenant && !isSuperAdmin(req.user)) {
            return res.status(403).json({ error: 'Only superadmins can create another company.' });
        }

        const existing = await prisma.myCompanyProfile.findFirst({
            where: { tenantKey: requestedTenant, deletedAt: null }
        });
        if (!existing && !isSuperAdmin(req.user)) {
            return res.status(403).json({ error: 'Only superadmins can create companies.' });
        }

        const data = {
            tenantKey: requestedTenant,
            companyName: req.body.companyName,
            address: req.body.address,
            gstNumber: req.body.gstNumber,
            panNumber: req.body.panNumber,
            bankName: req.body.bankName,
            accountNumber: req.body.accountNumber,
            ifscCode: req.body.ifscCode,
            signatoryRole: req.body.signatoryRole || 'Authorized Signatory'
        };

        const profile = existing
            ? await prisma.myCompanyProfile.update({ where: { id: existing.id }, data })
            : await prisma.myCompanyProfile.create({ data });
        res.json(profile);
    } catch (error) {
        console.error('Company profile save error:', error);
        res.status(400).json({ error: "Failed to save company profile." });
    }
});

module.exports = router;
