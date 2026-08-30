const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

// GET ALL SETTLEMENTS
router.get('/', async (req, res) => {
    try {
        const settlements = await prisma.vendorSettlement.findMany({
            where: withTenant(req),
            include: { vehicle: true, vendor: true, trips: true },
            orderBy: { id: 'desc' }
        });
        res.json(settlements);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch settlements." });
    }
});

// CREATE NEW VENDOR SETTLEMENT
router.post('/', async (req, res) => {
    const d = req.body;
    try {
        const lastSet = await prisma.vendorSettlement.findFirst({ where: withTenant(req), orderBy: { id: 'desc' } });
        let nextSeq = 1;
        if (lastSet && lastSet.settlementNo && lastSet.settlementNo.startsWith('VS')) {
            nextSeq = parseInt(lastSet.settlementNo.replace('VS', ''), 10) + 1;
        }
        const settlementNo = `VS${nextSeq.toString().padStart(3, '0')}`;

        const settlement = await prisma.vendorSettlement.create({
            data: {
                settlementNo,
                tenantKey: req.tenantKey,
                date: d.date ? new Date(d.date) : new Date(),
                
                vendorId: d.vendorId ? parseInt(d.vendorId) : null,
                
                totalFreight: parseFloat(d.totalFreight) || 0,
                totalHalting: parseFloat(d.totalHalting) || 0,
                totalExtraSize: parseFloat(d.totalExtraSize) || 0,
                grossAmount: parseFloat(d.grossAmount) || 0,
                totalAdvances: parseFloat(d.totalAdvances) || 0,
                totalCommission: parseFloat(d.totalCommission) || 0,
                otherDeductions: parseFloat(d.otherDeductions) || 0,
                netPayable: parseFloat(d.netPayable) || 0,
                status: 'Generated',
                
                trips: { connect: (d.tripIds || []).map(id => ({ id: parseInt(id) })) }
            }
        });

        // AUTOMATIC LEDGER POSTING directly to the Vendor Account
        if (d.vendorId) {
            await prisma.ledgerEntry.create({
                data: {
                    date: d.date ? new Date(d.date) : new Date(),
                    tenantKey: req.tenantKey,
                    accountId: parseInt(d.vendorId),
                    type: 'Cr',
                    amount: parseFloat(d.netPayable) || 0,
                    narration: `Auto-Settlement Generated: ${settlementNo}`,
                    settlementId: settlement.id
                }
            });
        }

        res.json(settlement);
    } catch (error) {
        console.error("Settlement Error:", error);
        res.status(400).json({ error: "Failed to create settlement." });
    }
});

// DELETE SETTLEMENT
router.delete('/:id', async (req, res) => {
    try {
        // Delete associated ledger entries first to avoid foreign key constraints
        await prisma.ledgerEntry.deleteMany({ where: withTenant(req, { settlementId: parseInt(req.params.id) }) });
        // Then delete the settlement itself
        await prisma.vendorSettlement.deleteMany({ where: withTenant(req, { id: parseInt(req.params.id) }) });
        res.json({ message: "Settlement deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete settlement." });
    }
});

module.exports = router;
