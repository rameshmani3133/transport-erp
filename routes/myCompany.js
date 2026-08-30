const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/all', async (req, res) => {
    try {
        const profiles = await prisma.myCompanyProfile.findMany({
            orderBy: { companyName: 'asc' }
        });
        res.json(profiles);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch company profiles." });
    }
});

// GET Company Profile
router.get('/', async (req, res) => {
    try {
        const profile = await prisma.myCompanyProfile.findUnique({
            where: { tenantKey: req.tenantKey }
        });
        res.json(profile || {});
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch company profile." });
    }
});

// CREATE or UPDATE Company Profile (Singleton)
router.post('/', async (req, res) => {
    try {
        const tenantKey = req.body.tenantKey || req.tenantKey;
        const existing = await prisma.myCompanyProfile.findUnique({
            where: { tenantKey }
        });
        const data = {
            tenantKey,
            companyName: req.body.companyName,
            address: req.body.address,
            gstNumber: req.body.gstNumber,
            panNumber: req.body.panNumber,
            bankName: req.body.bankName,
            accountNumber: req.body.accountNumber,
            ifscCode: req.body.ifscCode,
            signatoryRole: req.body.signatoryRole || 'Authorized Signatory'
        };

        let profile;
        if (existing && existing.tenantKey === tenantKey) {
            profile = await prisma.myCompanyProfile.update({
                where: { id: existing.id },
                data
            });
        } else {
            profile = await prisma.myCompanyProfile.upsert({
                where: { tenantKey },
                update: data,
                create: data
            });
        }
        res.json(profile);
    } catch (error) {
        res.status(400).json({ error: "Failed to save company profile." });
    }
});

module.exports = router;
