const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureDriverPayableAccount, ensureStandardAccountingAccounts } = require('../lib/accountingAccounts');
const { toNumber, toInt, toRequiredInt, toDate } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

const tripInclude = { route: true, company: true, vehicle: true, driver: true };

function normalizeTripDetails(tripDetails) {
    return [...new Map((tripDetails || [])
        .map(td => [toInt(td.id), td])
        .filter(([id]) => Number.isInteger(id))
    ).entries()].map(([id, td]) => ({ ...td, id }));
}

async function applyDriverSettlement(tx, req, settlementId, payload, settlementNo) {
    const driverId = toRequiredInt(payload.driverId, 'Driver');
    const tripDetails = normalizeTripDetails(payload.tripDetails);
    if (!Number.isInteger(driverId)) throw new Error('Driver is required.');
    if (!tripDetails.length) throw new Error('Please select at least one trip to settle.');

    const selectedTripIds = tripDetails.map(td => td.id);
    const allowedSettlementFilters = [{ driverSettlementId: null }];
    if (settlementId) allowedSettlementFilters.push({ driverSettlementId: settlementId });
    const selectedTrips = await tx.trip.findMany({
        where: withTenant(req, {
            id: { in: selectedTripIds },
            driverId,
            OR: allowedSettlementFilters
        })
    });

    if (selectedTrips.length !== selectedTripIds.length) {
        throw new Error('One or more trips are already settled elsewhere or do not belong to this driver.');
    }

    if (settlementId) {
        await tx.trip.updateMany({
            where: withTenant(req, { driverSettlementId: settlementId, id: { notIn: selectedTripIds } }),
            data: {
                driverSettlementId: null,
                rtoPc: 0,
                parking: 0,
                loading: 0,
                unloading: 0,
                otherBillsAmount: 0,
                otherBillsDesc: null
            }
        });
    }

    let totalExp = 0;
    for (const td of tripDetails) {
        const rto = toNumber(td.rtoPc);
        const park = toNumber(td.parking);
        const load = toNumber(td.loading);
        const unload = toNumber(td.unloading);
        const otherAmt = toNumber(td.otherBillsAmount);

        totalExp += rto + park + load + unload + otherAmt;

        await tx.trip.updateMany({
            where: withTenant(req, { id: td.id }),
            data: {
                driverSettlementId: settlementId || undefined,
                rtoPc: rto,
                parking: park,
                loading: load,
                unloading: unload,
                otherBillsAmount: otherAmt,
                otherBillsDesc: td.otherBillsDesc || null
            }
        });
    }

    const salary = toNumber(payload.driverSalary);
    const advances = selectedTrips.reduce((sum, trip) => sum + toNumber(trip.advancePaid), 0);
    const totalDueToDriver = totalExp + salary;
    const netPayable = totalDueToDriver - advances;
    const settlementDate = toDate(payload.date, new Date());

    let settlement;
    if (settlementId) {
        settlement = await tx.driverSettlement.update({
            where: { id: settlementId },
            data: {
                date: settlementDate,
                driverId,
                driverSalary: salary,
                totalExpenses: totalExp,
                advanceDeducted: advances,
                netPayable
            }
        });
        await tx.ledgerEntry.updateMany({ where: withTenant(req, { driverSettlementId: settlementId }), data: { deletedAt: new Date() } });
    } else {
        settlement = await tx.driverSettlement.create({
            data: {
                settlementNo,
                tenantKey: req.tenantKey,
                date: settlementDate,
                driverId,
                driverSalary: salary,
                totalExpenses: totalExp,
                advanceDeducted: advances,
                netPayable
            }
        });
        await tx.trip.updateMany({
            where: withTenant(req, { id: { in: selectedTripIds } }),
            data: { driverSettlementId: settlement.id }
        });
    }

    const driver = await tx.driver.findFirst({ where: withTenant(req, { id: driverId }) });
    const driverAcc = driver ? await ensureDriverPayableAccount(tx, req, driver) : null;
    if (driverAcc && totalDueToDriver > 0) {
        const standardAccounts = await ensureStandardAccountingAccounts(tx, req);
        const expenseAccount = standardAccounts['Driver Salary & Trip Expense'];
        await tx.ledgerEntry.createMany({
            data: [
                {
                    date: settlementDate,
                    tenantKey: req.tenantKey,
                    accountId: expenseAccount.id,
                    type: 'Dr',
                    amount: totalDueToDriver,
                    narration: `Driver Salary & Trip Expense - ${settlement.settlementNo}`,
                    driverSettlementId: settlement.id
                },
                {
                    date: settlementDate,
                    tenantKey: req.tenantKey,
                    accountId: driverAcc.id,
                    type: 'Cr',
                    amount: totalDueToDriver,
                    narration: `Driver Payable - ${settlement.settlementNo}`,
                    driverSettlementId: settlement.id
                }
            ]
        });
    }

    return settlement;
}

// GET ALL DRIVER SETTLEMENTS
router.get('/', async (req, res) => {
    try {
        const settlements = await prisma.driverSettlement.findMany({
            where: withTenant(req),
            include: { trips: { include: tripInclude }, driver: true },
            orderBy: { id: 'desc' }
        });
        res.json(settlements);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch driver settlements." });
    }
});

// CREATE MONTHLY DRIVER SETTLEMENT & BATCH UPDATE TRIP EXPENSES
router.post('/', async (req, res) => {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const lastSet = await tx.driverSettlement.findFirst({ where: withTenant(req), orderBy: { id: 'desc' } });
            let nextSeq = 1;
            if (lastSet && lastSet.settlementNo && lastSet.settlementNo.startsWith('DS')) {
                nextSeq = toInt(lastSet.settlementNo.replace('DS', ''), 0) + 1;
            }
            const settlementNo = `DS${nextSeq.toString().padStart(3, '0')}`;
            return applyDriverSettlement(tx, req, null, req.body, settlementNo);
        });

        res.json(result);
    } catch (error) {
        console.error("Settlement Creation Error:", error);
        res.status(400).json({ error: error.message || "Failed to process monthly settlement and trip expenses." });
    }
});

// UPDATE SETTLEMENT
router.put('/:id', async (req, res) => {
    try {
        const id = toRequiredInt(req.params.id, 'Driver settlement');
        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.driverSettlement.findFirst({ where: withTenant(req, { id }) });
            if (!existing) throw new Error('Settlement not found.');
            return applyDriverSettlement(tx, req, id, req.body, existing.settlementNo);
        });

        res.json(result);
    } catch (error) {
        console.error("Settlement Update Error:", error);
        res.status(400).json({ error: error.message || "Failed to update settlement." });
    }
});

// DELETE SETTLEMENT
router.delete('/:id', async (req, res) => {
    try {
        await prisma.$transaction(async (tx) => {
            const id = toRequiredInt(req.params.id, 'Driver settlement');
            await tx.ledgerEntry.updateMany({ where: withTenant(req, { driverSettlementId: id }), data: { deletedAt: new Date() } });
            await tx.trip.updateMany({
                where: withTenant(req, { driverSettlementId: id }),
                data: {
                    driverSettlementId: null,
                    rtoPc: 0,
                    parking: 0,
                    loading: 0,
                    unloading: 0,
                    otherBillsAmount: 0,
                    otherBillsDesc: null
                }
            });
            await tx.driverSettlement.updateMany({ where: withTenant(req, { id }), data: { deletedAt: new Date() } });
        });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: "Failed to delete settlement." });
    }
});

module.exports = router;

