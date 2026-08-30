const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

// GET ALL DRIVER SETTLEMENTS
router.get('/', async (req, res) => {
    try {
        const settlements = await prisma.driverSettlement.findMany({
            where: withTenant(req),
            include: { trips: true, driver: true },
            orderBy: { id: 'desc' }
        });
        res.json(settlements);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch driver settlements." });
    }
});

// CREATE MONTHLY DRIVER SETTLEMENT & BATCH UPDATE TRIP EXPENSES
router.post('/', async (req, res) => {
    const { driverId, date, driverSalary, advanceDeducted, tripDetails } = req.body;
    
    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Generate Settlement No
            const lastSet = await tx.driverSettlement.findFirst({ where: withTenant(req), orderBy: { id: 'desc' } });
            let nextSeq = 1;
            if (lastSet && lastSet.settlementNo && lastSet.settlementNo.startsWith('DS')) {
                nextSeq = parseInt(lastSet.settlementNo.replace('DS', ''), 10) + 1;
            }
            const settlementNo = `DS${nextSeq.toString().padStart(3, '0')}`;

            let totalExp = 0;
            const tripsToConnect = [];

            // 2. Loop through and update each individual trip with its specific expenses
            for (const td of (tripDetails || [])) {
                const rto = parseFloat(td.rtoPc) || 0;
                const park = parseFloat(td.parking) || 0;
                const load = parseFloat(td.loading) || 0;
                const unload = parseFloat(td.unloading) || 0;
                const otherAmt = parseFloat(td.otherBillsAmount) || 0;
                
                totalExp += (rto + park + load + unload + otherAmt);
                tripsToConnect.push({ id: td.id });

                await tx.trip.updateMany({
                    where: withTenant(req, { id: td.id }),
                    data: {
                        rtoPc: rto,
                        parking: park,
                        loading: load,
                        unloading: unload,
                        otherBillsAmount: otherAmt,
                        otherBillsDesc: td.otherBillsDesc || null
                    }
                });
            }

            // 3. Calculate Final Net Payable
            const salary = parseFloat(driverSalary) || 0;
            const advances = parseFloat(advanceDeducted) || 0;
            const totalDueToDriver = totalExp + salary; 
            const netPayable = totalDueToDriver - advances;

            // 4. Create the Master Settlement Record
            const settlement = await tx.driverSettlement.create({
                data: {
                    settlementNo,
                    tenantKey: req.tenantKey,
                    date: date ? new Date(date) : new Date(),
                    driverId: parseInt(driverId),
                    driverSalary: salary,
                    totalExpenses: totalExp,
                    advanceDeducted: advances,
                    netPayable: netPayable,
                    trips: { connect: tripsToConnect }
                }
            });

            // 5. Ledger Sync: Credit the Driver's Account
            const driverAcc = await tx.account.findFirst({ where: withTenant(req, { driverId: parseInt(driverId) }) });
            if (driverAcc && totalDueToDriver > 0) {
                await tx.ledgerEntry.create({
                    data: {
                        date: date ? new Date(date) : new Date(),
                        tenantKey: req.tenantKey,
                        accountId: driverAcc.id,
                        type: 'Cr',
                        amount: totalDueToDriver,
                        narration: `Monthly Payroll & Bills - ${settlementNo}`,
                        driverSettlementId: settlement.id
                    }
                });
            }

            return settlement;
        });

        res.json(result);
    } catch (error) {
        console.error("Settlement Creation Error:", error);
        res.status(400).json({ error: "Failed to process monthly settlement and trip expenses." });
    }
});

// DELETE SETTLEMENT
router.delete('/:id', async (req, res) => {
    try {
        await prisma.$transaction(async (tx) => {
            const id = parseInt(req.params.id);
            // Delete associated ledger entries
            await tx.ledgerEntry.updateMany({ where: withTenant(req, { driverSettlementId: id }), data: { deletedAt: new Date() } });
            
            // Disconnect trips (Prisma does this automatically on delete, but we explicitly reset the expense fields to keep DB clean)
            await tx.trip.updateMany({
                where: withTenant(req, { driverSettlementId: id }),
                data: { rtoPc: 0, parking: 0, loading: 0, unloading: 0, otherBillsAmount: 0, otherBillsDesc: null }
            });
            
            // Delete settlement
            await tx.driverSettlement.updateMany({ where: withTenant(req, { id }), data: { deletedAt: new Date() } });
        });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: "Failed to delete settlement." });
    }
});

module.exports = router;

