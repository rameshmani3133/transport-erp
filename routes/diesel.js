const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureStandardAccountingAccounts } = require('../lib/accountingAccounts');
const { toNumber, toInt, toRequiredInt, toDate } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

function dieselPayload(req, d, isUpdate = false) {
    return {
        date: toDate(d.date, isUpdate ? undefined : new Date()),
        tenantKey: req.tenantKey,
        vehicleId: toRequiredInt(d.vehicleId, 'Vehicle'),
        driverId: toInt(d.driverId),
        tripId: toInt(d.tripId),
        pumpAccountId: toRequiredInt(d.pumpAccountId, 'Fuel pump ledger'),
        slipNumber: d.slipNumber,
        quantityLiters: toNumber(d.quantityLiters),
        ratePerLiter: toNumber(d.ratePerLiter),
        totalAmount: toNumber(d.totalAmount),
        paymentMode: d.paymentMode || 'Credit'
    };
}

async function syncDieselLedger(tx, req, diesel) {
    await tx.ledgerEntry.updateMany({ where: withTenant(req, { dieselId: diesel.id }), data: { deletedAt: new Date() } });
    if (!diesel.pumpAccountId || diesel.totalAmount <= 0) return;

    const standardAccounts = await ensureStandardAccountingAccounts(tx, req);
    const vehicle = await tx.vehicle.findFirst({ where: withTenant(req, { id: diesel.vehicleId }) });
    const debitAccountId = vehicle?.ownershipType === 'Market' && vehicle.vendorAccountId
        ? vehicle.vendorAccountId
        : standardAccounts['Diesel Expense'].id;
    if (!debitAccountId) throw new Error('Diesel debit account could not be resolved.');
    const debitNarration = vehicle?.ownershipType === 'Market'
        ? `Diesel Recovery from Vendor - Slip ${diesel.slipNumber || diesel.id}`
        : `Diesel Expense - Slip ${diesel.slipNumber || diesel.id}`;

    await tx.ledgerEntry.createMany({
        data: [
            {
                date: diesel.date,
                tenantKey: req.tenantKey,
                accountId: debitAccountId,
                type: 'Dr',
                amount: diesel.totalAmount,
                narration: debitNarration,
                dieselId: diesel.id,
                tripId: diesel.tripId || null,
                vehicleId: diesel.vehicleId
            },
            {
                date: diesel.date,
                tenantKey: req.tenantKey,
                accountId: diesel.pumpAccountId,
                type: 'Cr',
                amount: diesel.totalAmount,
                narration: `Diesel Payable - Slip ${diesel.slipNumber || diesel.id}`,
                dieselId: diesel.id,
                tripId: diesel.tripId || null,
                vehicleId: diesel.vehicleId
            }
        ]
    });
}

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

router.post('/', async (req, res) => {
    const d = req.body;
    try {
        const diesel = await prisma.$transaction(async (tx) => {
            const createdDiesel = await tx.diesel.create({ data: dieselPayload(req, d) });
            await syncDieselLedger(tx, req, createdDiesel);
            return createdDiesel;
        });
        res.json(diesel);
    } catch (error) {
        console.error("Diesel Create Error:", error);
        res.status(400).json({ error: error.message || "Failed to save diesel entry." });
    }
});

router.put('/:id', async (req, res) => {
    const d = req.body;
    try {
        const diesel = await prisma.$transaction(async (tx) => {
            const updatedDiesel = await tx.diesel.update({
                where: withTenant(req, { id: toRequiredInt(req.params.id, 'Diesel entry') }),
                data: dieselPayload(req, d, true)
            });
            await syncDieselLedger(tx, req, updatedDiesel);
            return updatedDiesel;
        });
        res.json(diesel);
    } catch (error) {
        console.error("Diesel Update Error:", error);
        res.status(400).json({ error: error.message || "Failed to update diesel entry." });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.$transaction(async (tx) => {
            const id = toRequiredInt(req.params.id, 'Diesel entry');
            await tx.ledgerEntry.updateMany({ where: withTenant(req, { dieselId: id }), data: { deletedAt: new Date() } });
            await tx.diesel.updateMany({ where: withTenant(req, { id }), data: { deletedAt: new Date() } });
        });
        res.json({ message: "Deleted successfully." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete entry." });
    }
});

module.exports = router;

