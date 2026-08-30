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




router.get('/deleted/all', async (req, res) => {
    try {
        if (!isSuperAdmin(req.user)) {
            return res.status(403).json({ error: 'Only superadmins can view deleted companies.' });
        }
        const profiles = await prisma.myCompanyProfile.findMany({
            where: { deletedAt: { not: null } },
            orderBy: { deletedAt: 'desc' }
        });
        res.json(profiles);
    } catch (error) {
        console.error('Deleted company profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch deleted companies.' });
    }
});

router.patch('/profile/:id/restore', async (req, res) => {
    try {
        if (!isSuperAdmin(req.user)) {
            return res.status(403).json({ error: 'Only superadmins can restore companies.' });
        }
        const id = parseInt(req.params.id, 10);
        const profile = await prisma.myCompanyProfile.findFirst({ where: { id, deletedAt: { not: null } } });
        if (!profile) return res.status(404).json({ error: 'Deleted company not found.' });

        const restored = await prisma.myCompanyProfile.update({
            where: { id },
            data: { deletedAt: null }
        });
        res.json(restored);
    } catch (error) {
        console.error('Company profile restore error:', error);
        res.status(400).json({ error: 'Failed to restore company.' });
    }
});

router.delete('/profile/:id/permanent', async (req, res) => {
    try {
        if (!isSuperAdmin(req.user)) {
            return res.status(403).json({ error: 'Only superadmins can permanently delete companies.' });
        }
        const id = parseInt(req.params.id, 10);
        const profile = await prisma.myCompanyProfile.findFirst({ where: { id, deletedAt: { not: null } } });
        if (!profile) return res.status(404).json({ error: 'Deleted company not found.' });

        await prisma.$transaction(async (tx) => {
            await tx.userCompanyAccess.deleteMany({ where: { tenantKey: profile.tenantKey, deletedAt: { not: null } } });
            await tx.myCompanyProfile.delete({ where: { id } });
        });
        res.json({ message: 'Company permanently deleted.', tenantKey: profile.tenantKey });
    } catch (error) {
        console.error('Company profile permanent delete error:', error);
        res.status(400).json({ error: 'Failed to permanently delete company.' });
    }
});
router.put('/profile/:id', async (req, res) => {
    try {
        if (!isSuperAdmin(req.user)) {
            return res.status(403).json({ error: 'Only superadmins can edit companies.' });
        }
        const id = parseInt(req.params.id, 10);
        const existing = await prisma.myCompanyProfile.findFirst({ where: { id, deletedAt: null } });
        if (!existing) return res.status(404).json({ error: 'Company not found.' });

        const profile = await prisma.myCompanyProfile.update({
            where: { id },
            data: {
                companyName: req.body.companyName,
                address: req.body.address,
                gstNumber: req.body.gstNumber,
                panNumber: req.body.panNumber,
                bankName: req.body.bankName,
                accountNumber: req.body.accountNumber,
                ifscCode: req.body.ifscCode,
                signatoryRole: req.body.signatoryRole || existing.signatoryRole || 'Authorized Signatory'
            }
        });
        res.json(profile);
    } catch (error) {
        console.error('Company profile update error:', error);
        res.status(400).json({ error: 'Failed to update company.' });
    }
});

router.delete('/profile/:id', async (req, res) => {
    try {
        if (!isSuperAdmin(req.user)) {
            return res.status(403).json({ error: 'Only superadmins can delete companies.' });
        }
        const id = parseInt(req.params.id, 10);
        const profile = await prisma.myCompanyProfile.findFirst({ where: { id, deletedAt: null } });
        if (!profile) return res.status(404).json({ error: 'Company not found.' });

        const deletedAt = new Date();
        await prisma.$transaction(async (tx) => {
            await tx.myCompanyProfile.updateMany({
                where: { tenantKey: profile.tenantKey, deletedAt: null },
                data: { deletedAt }
            });
            await tx.userCompanyAccess.updateMany({
                where: { tenantKey: profile.tenantKey, deletedAt: null },
                data: { deletedAt }
            });
        });
        res.json({ message: 'Company deleted.', tenantKey: profile.tenantKey });
    } catch (error) {
        console.error('Company profile delete error:', error);
        res.status(400).json({ error: 'Failed to delete company.' });
    }
});
router.delete('/:tenantKey', async (req, res) => {
    try {
        if (!isSuperAdmin(req.user)) {
            return res.status(403).json({ error: 'Only superadmins can delete companies.' });
        }
        const tenantKey = normalizeTenantKey(req.params.tenantKey);
        const deletedAt = new Date();
        const result = await prisma.$transaction(async (tx) => {
            const profileUpdate = await tx.myCompanyProfile.updateMany({
                where: { tenantKey, deletedAt: null },
                data: { deletedAt }
            });
            await tx.userCompanyAccess.updateMany({
                where: { tenantKey, deletedAt: null },
                data: { deletedAt }
            });
            return profileUpdate;
        });
        if (!result.count) return res.status(404).json({ error: 'Company not found.' });
        res.json({ message: 'Company deleted.', tenantKey });
    } catch (error) {
        console.error('Company profile delete error:', error);
        res.status(400).json({ error: 'Failed to delete company.' });
    }
});
module.exports = router;
