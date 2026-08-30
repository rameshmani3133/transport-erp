const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

// GET ALL PARENT COMPANIES / BILLING MASTERS
router.get('/', async (req, res) => {
    try {
        const billingMasters = await prisma.billingMaster.findMany({
            where: withTenant(req),
            orderBy: { id: 'desc' }
        });
        res.json(billingMasters);
    } catch (error) {
        console.error("Billing Master Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch Parent Companies." });
    }
});

// CREATE PARENT COMPANY
router.post('/', async (req, res) => {
    try {
        const newBilling = await prisma.billingMaster.create({
            data: {
                tenantKey: req.tenantKey,
                companyName: req.body.companyName,
                address: req.body.address,
                gstin: req.body.gstin,
                pan: req.body.pan,
                bankName: req.body.bankName,
                accountNumber: req.body.accountNumber,
                ifscCode: req.body.ifscCode
            }
        });
        res.json(newBilling);
    } catch (error) {
        console.error("Billing Master Create Error:", error);
        res.status(400).json({ error: error.message || "Failed to create Parent Company." });
    }
});

// UPDATE PARENT COMPANY
router.put('/:id', async (req, res) => {
    try {
        const updatedBilling = await prisma.billingMaster.update({
            where: withTenant(req, { id: parseInt(req.params.id) }),
            data: {
                companyName: req.body.companyName,
                address: req.body.address,
                gstin: req.body.gstin,
                pan: req.body.pan,
                bankName: req.body.bankName,
                accountNumber: req.body.accountNumber,
                ifscCode: req.body.ifscCode
            }
        });
        res.json(updatedBilling);
    } catch (error) {
        console.error("Billing Master Update Error:", error);
        res.status(400).json({ error: error.message || "Failed to update Parent Company." });
    }
});

// DELETE PARENT COMPANY
router.delete('/:id', async (req, res) => {
    try {
        await prisma.billingMaster.deleteMany({
            where: withTenant(req, { id: parseInt(req.params.id) })
        });
        res.json({ message: "Parent Company deleted successfully." });
    } catch (error) {
        console.error("Billing Master Delete Error:", error);
        res.status(400).json({ error: "Failed to delete Parent Company." });
    }
});

module.exports = router;
