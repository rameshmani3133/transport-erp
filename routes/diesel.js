const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

// GET ALL DIESEL ENTRIES
router.get('/', async (req, res) => {
    try {
        const diesels = await prisma.diesel.findMany({
            where: withTenant(req),
            include: { vehicle: true, driver: true, trip: true, pumpAccount: true },
            orderBy: { date: 'desc' }
        });
        res.json(diesels);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch diesel entries." });
    }
});

// CREATE DIESEL ENTRY
router.post('/', async (req, res) => {
    const d = req.body;
    try {
        const diesel = await prisma.diesel.create({
            data: {
                date: d.date ? new Date(d.date) : new Date(),
                tenantKey: req.tenantKey,
                vehicleId: parseInt(d.vehicleId),
                driverId: d.driverId ? parseInt(d.driverId) : null,
                tripId: d.tripId ? parseInt(d.tripId) : null,
                
                // Bind strictly to Ledger Account
                pumpAccountId: parseInt(d.pumpAccountId),
                
                slipNumber: d.slipNumber,
                quantityLiters: parseFloat(d.quantityLiters) || 0,
                ratePerLiter: parseFloat(d.ratePerLiter) || 0,
                totalAmount: parseFloat(d.totalAmount) || 0,
                paymentMode: d.paymentMode || 'Credit'
            }
        });
        res.json(diesel);
    } catch (error) {
        console.error("Diesel Create Error:", error);
        res.status(400).json({ error: "Failed to save diesel entry." });
    }
});

// UPDATE DIESEL ENTRY
router.put('/:id', async (req, res) => {
    const d = req.body;
    try {
        const diesel = await prisma.diesel.update({
            where: withTenant(req, { id: parseInt(req.params.id) }),
            data: {
                date: d.date ? new Date(d.date) : undefined,
                vehicleId: parseInt(d.vehicleId),
                driverId: d.driverId ? parseInt(d.driverId) : null,
                tripId: d.tripId ? parseInt(d.tripId) : null,
                
                pumpAccountId: parseInt(d.pumpAccountId),
                
                slipNumber: d.slipNumber,
                quantityLiters: parseFloat(d.quantityLiters) || 0,
                ratePerLiter: parseFloat(d.ratePerLiter) || 0,
                totalAmount: parseFloat(d.totalAmount) || 0,
                paymentMode: d.paymentMode || 'Credit'
            }
        });
        res.json(diesel);
    } catch (error) {
        res.status(400).json({ error: "Failed to update diesel entry." });
    }
});

// DELETE DIESEL ENTRY
router.delete('/:id', async (req, res) => {
    try {
        await prisma.diesel.deleteMany({ where: withTenant(req, { id: parseInt(req.params.id) }) });
        res.json({ message: "Deleted successfully." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete entry." });
    }
});

module.exports = router;
