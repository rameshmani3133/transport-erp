const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureClientLedgerAccount } = require('../lib/accountingAccounts');
const { toRequiredInt, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

// GET ALL BILLING LOCATIONS (Includes Client Company details)
router.get('/', async (req, res) => {
    try {
        const locations = await prisma.billingLocation.findMany({
            where: withTenant(req),
            include: { company: true },
            orderBy: { id: 'desc' }
        });
        res.json(locations);
    } catch (error) {
        console.error("Location Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch locations." });
    }
});

async function ensureParentCompanyLedger(tx, req, companyId) {
    const company = await tx.clientCompany.findFirst({ where: withTenant(req, { id: companyId }) });
    if (!company) throw new Error('Selected client company was not found.');
    await ensureClientLedgerAccount(tx, req, company);
}

// CREATE NEW BILLING LOCATION
router.post('/', async (req, res) => {
    try {
        const newLocation = await prisma.$transaction(async (tx) => {
            const companyId = toRequiredInt(req.body.companyId, 'Client company');
            await ensureParentCompanyLedger(tx, req, companyId);
            if (!text(req.body.locationName)) throw new Error('Billing location is required.');
            return tx.billingLocation.create({
                data: {
                    locationName: text(req.body.locationName),
                    tenantKey: req.tenantKey,
                    address: req.body.address || null,
                    gstNumber: req.body.gstNumber || null,
                    invoiceFormat: req.body.invoiceFormat || 'Standard',
                    companyId
                }
            });
        });
        res.json(newLocation);
    } catch (error) {
        console.error("Location Create Error:", error);
        res.status(400).json({ error: error.message || "Failed to create location." });
    }
});

// UPDATE BILLING LOCATION
router.put('/:id', async (req, res) => {
    try {
        const updatedLocation = await prisma.$transaction(async (tx) => {
            const companyId = toRequiredInt(req.body.companyId, 'Client company');
            await ensureParentCompanyLedger(tx, req, companyId);
            if (!text(req.body.locationName)) throw new Error('Billing location is required.');
            return tx.billingLocation.update({
                where: withTenant(req, { id: toRequiredInt(req.params.id, 'Billing location') }),
                data: {
                    locationName: text(req.body.locationName),
                    address: req.body.address || null,
                    gstNumber: req.body.gstNumber || null,
                    invoiceFormat: req.body.invoiceFormat || 'Standard',
                    companyId
                }
            });
        });
        res.json(updatedLocation);
    } catch (error) {
        console.error("Location Update Error:", error);
        res.status(400).json({ error: error.message || "Failed to update location." });
    }
});

// DELETE BILLING LOCATION
router.delete('/:id', async (req, res) => {
    try {
        await prisma.billingLocation.updateMany({ where: withTenant(req, { id: toRequiredInt(req.params.id, 'Billing location') }), data: { deletedAt: new Date() } });
        res.json({ message: "Location deleted successfully." });
    } catch (error) {
        console.error("Location Delete Error:", error);
        res.status(400).json({ error: "Failed to delete location. It may be linked to an invoice." });
    }
});

module.exports = router;
