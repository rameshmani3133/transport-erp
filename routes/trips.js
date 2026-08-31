const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureDriverAdvanceAccount, ensureStandardAccountingAccounts, ensureClientDieselAccount, ensureVendorDieselAccount } = require('../lib/accountingAccounts');
const { toNumber, toInt, toRequiredInt, toDate } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

async function resolveAdvanceReceiverAccount(tx, req, trip, vehicle) {
    if (vehicle?.ownershipType === 'Market') {
        if (!vehicle.vendorAccountId) throw new Error('Market vehicle needs a linked vendor ledger before paying vendor advance.');
        return vehicle.vendorAccountId;
    }

    if (!trip.driverId) throw new Error('Select a driver before paying driver advance.');
    const driver = await tx.driver.findFirst({ where: withTenant(req, { id: trip.driverId }) });
    if (!driver) throw new Error('Selected driver was not found.');
    const driverAccount = await ensureDriverAdvanceAccount(tx, req, driver);
    if (!driverAccount) throw new Error('Driver ledger account could not be created.');
    return driverAccount.id;
}

// SMART LEDGER SYNC ENGINE FOR TRIP ADVANCES
async function syncTripAdvanceLedger(tx, req, trip, vehicle) {
    await tx.ledgerEntry.updateMany({ where: withTenant(req, { tripId: trip.id, narration: { contains: 'Advance' } }), data: { deletedAt: new Date() } });
    await tx.ledgerEntry.updateMany({ where: withTenant(req, { tripId: trip.id, narration: { contains: 'Trip Diesel' } }), data: { deletedAt: new Date() } });

    if (trip.advancePaid > 0) {
        if (!trip.advanceAccountId) throw new Error('Select cash/bank account for driver/vendor advance paid.');
        const debitAccountId = await resolveAdvanceReceiverAccount(tx, req, trip, vehicle);

        await tx.ledgerEntry.createMany({
            data: [
                {
                    date: trip.advanceDate || new Date(),
                    tenantKey: req.tenantKey,
                    accountId: debitAccountId,
                    type: 'Dr',
                    amount: trip.advancePaid,
                    narration: `Driver/Vendor Advance Received - Trip No: ${trip.tripNo}`,
                    tripId: trip.id
                },
                {
                    date: trip.advanceDate || new Date(),
                    tenantKey: req.tenantKey,
                    accountId: trip.advanceAccountId,
                    type: 'Cr',
                    amount: trip.advancePaid,
                    narration: `Driver/Vendor Advance Paid - Trip No: ${trip.tripNo}`,
                    tripId: trip.id
                }
            ]
        });
    }

    if (trip.dieselAmount > 0) {
        const company = await tx.clientCompany.findFirst({ where: withTenant(req, { id: trip.companyId }) });
        if (!company) throw new Error('Selected client company was not found for diesel mapping.');
        const clientDieselAccount = await ensureClientDieselAccount(tx, req, company);
        const standardAccounts = await ensureStandardAccountingAccounts(tx, req);
        let debitAccountId = standardAccounts['Diesel Expense'].id;
        let debitNarration = `Client-Paid Diesel Expense - Trip No: ${trip.tripNo}`;

        if (vehicle?.ownershipType === 'Market') {
            if (!vehicle.vendorAccountId) throw new Error('Market vehicle needs vendor ledger for client-paid diesel mapping.');
            const vendorAccount = await tx.account.findFirst({ where: withTenant(req, { id: vehicle.vendorAccountId }) });
            const vendorDieselAccount = vendorAccount ? await ensureVendorDieselAccount(tx, req, vendorAccount) : null;
            if (!vendorDieselAccount) throw new Error('Vendor diesel account could not be created.');
            debitAccountId = vendorDieselAccount.id;
            debitNarration = `Client-Paid Diesel Recoverable from Vendor - Trip No: ${trip.tripNo}`;
        }

        await tx.ledgerEntry.createMany({
            data: [
                {
                    date: trip.date || new Date(),
                    tenantKey: req.tenantKey,
                    accountId: debitAccountId,
                    type: 'Dr',
                    amount: trip.dieselAmount,
                    narration: debitNarration,
                    tripId: trip.id,
                    vehicleId: trip.vehicleId
                },
                {
                    date: trip.date || new Date(),
                    tenantKey: req.tenantKey,
                    accountId: clientDieselAccount.id,
                    type: 'Cr',
                    amount: trip.dieselAmount,
                    narration: `Client-Paid Diesel Advance - Trip No: ${trip.tripNo}`,
                    tripId: trip.id,
                    vehicleId: trip.vehicleId
                }
            ]
        });
    }
    if (trip.clientAdvanceAmount > 0) {
        if (!trip.clientAdvanceAccountId || !trip.clientAdvanceClientAccountId) {
            throw new Error('Select both cash/bank account and client ledger account for client advance.');
        }

        await tx.ledgerEntry.createMany({
            data: [
                {
                    date: trip.clientAdvanceDate || new Date(),
                    tenantKey: req.tenantKey,
                    accountId: trip.clientAdvanceAccountId,
                    type: 'Dr',
                    amount: trip.clientAdvanceAmount,
                    narration: `Client Advance Received - Trip No: ${trip.tripNo}`,
                    tripId: trip.id
                },
                {
                    date: trip.clientAdvanceDate || new Date(),
                    tenantKey: req.tenantKey,
                    accountId: trip.clientAdvanceClientAccountId,
                    type: 'Cr',
                    amount: trip.clientAdvanceAmount,
                    narration: `Client Advance Received - Trip No: ${trip.tripNo}`,
                    tripId: trip.id
                }
            ]
        });
    }
}

function tripPayload(req, d, isUpdate = false) {
    return {
        date: toDate(d.date, isUpdate ? undefined : new Date()),
        companyId: toRequiredInt(d.companyId, 'Client company'),
        routeId: toRequiredInt(d.routeId, 'Route'),
        vehicleId: toRequiredInt(d.vehicleId, 'Vehicle'),
        driverId: toInt(d.driverId),
        length: toNumber(d.length) || null,
        width: toNumber(d.width) || null,
        height: toNumber(d.height) || null,
        odcSize: toNumber(d.odcSize) || null,
        clientOdcRate: toNumber(d.clientOdcRate),
        vendorOdcRate: toNumber(d.vendorOdcRate),
        clientExtraSizeCharge: toNumber(d.clientExtraSizeCharge),
        vendorExtraSizeCharge: toNumber(d.vendorExtraSizeCharge),
        haltingDays: toNumber(d.haltingDays),
        clientHaltRate: toNumber(d.clientHaltRate),
        vendorHaltRate: toNumber(d.vendorHaltRate),
        haltingCharge: toNumber(d.clientHaltingCharge),
        vendorHaltingCharge: toNumber(d.vendorHaltingCharge),
        billWeight: toNumber(d.billWeight),
        guaranteeWeight: toNumber(d.guaranteeWeight),
        netWeight: Math.max(toNumber(d.billWeight), toNumber(d.guaranteeWeight)),
        commission: toNumber(d.commission),
        clientCalcType: d.clientCalcType || 'PerTon',
        clientRate: toNumber(d.clientRate),
        vendorCalcType: d.vendorCalcType || 'PerTon',
        vendorRate: toNumber(d.vendorRate),
        totalClientBill: toNumber(d.totalClientBill),
        netTruckPayout: toNumber(d.netTruckPayout),
        dieselAccountId: toInt(d.dieselPumpId),
        dieselLiters: toNumber(d.dieselLiters),
        dieselRate: toNumber(d.dieselRate),
        dieselAmount: toNumber(d.dieselAmount),
        advanceAccountId: toInt(d.advanceAccountId),
        advanceDate: toDate(d.advanceDate),
        advancePaid: toNumber(d.advancePaid),
        clientAdvanceAccountId: toInt(d.clientAdvanceAccountId),
        clientAdvanceClientAccountId: toInt(d.clientAdvanceClientAccountId),
        clientAdvanceDate: toDate(d.clientAdvanceDate),
        clientAdvanceAmount: toNumber(d.clientAdvanceAmount),
        status: d.status || 'In-Transit'
    };
}

router.get('/', async (req, res) => {
    try {
        const trips = await prisma.trip.findMany({
            where: withTenant(req),
            include: { company: true, route: true, vehicle: true, driver: true },
            orderBy: { id: 'desc' }
        });
        res.json(trips);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch trips." });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const trip = await prisma.trip.findFirst({
            where: withTenant(req, { id: toRequiredInt(req.params.id, 'Trip') }),
            include: { company: true, route: true, vehicle: true, driver: true }
        });
        if (!trip) return res.status(404).json({ error: "Trip not found." });
        res.json(trip);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch the trip." });
    }
});

router.post('/', async (req, res) => {
    const d = req.body;
    try {
        const trip = await prisma.$transaction(async (tx) => {
            const lastTrip = await tx.trip.findFirst({ where: withTenant(req), orderBy: { id: 'desc' } });
            let nextSeq = 1;
            if (lastTrip && lastTrip.tripNo && lastTrip.tripNo.startsWith('TRP')) {
                const lastSeq = toInt(lastTrip.tripNo.replace('TRP', ''), 0);
                if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
            }
            const tripNo = `TRP${nextSeq.toString().padStart(3, '0')}`;
            const createdTrip = await tx.trip.create({
                data: {
                    tripNo,
                    tenantKey: req.tenantKey,
                    ...tripPayload(req, d)
                }
            });
            const vehicle = await tx.vehicle.findFirst({ where: withTenant(req, { id: createdTrip.vehicleId }) });
            await syncTripAdvanceLedger(tx, req, createdTrip, vehicle);
            return createdTrip;
        });

        res.json(trip);
    } catch (error) {
        console.error("Trip Create Error:", error);
        res.status(400).json({ error: error.message || "Failed to create trip." });
    }
});

router.put('/:id', async (req, res) => {
    const d = req.body;
    try {
        const trip = await prisma.$transaction(async (tx) => {
            const updatedTrip = await tx.trip.update({
                where: withTenant(req, { id: toRequiredInt(req.params.id, 'Trip') }),
                data: tripPayload(req, d, true)
            });
            const vehicle = await tx.vehicle.findFirst({ where: withTenant(req, { id: updatedTrip.vehicleId }) });
            await syncTripAdvanceLedger(tx, req, updatedTrip, vehicle);
            return updatedTrip;
        });

        res.json(trip);
    } catch (error) {
        console.error("Trip Update Error:", error);
        res.status(400).json({ error: error.message || "Failed to update trip." });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.$transaction(async (tx) => {
            const id = toRequiredInt(req.params.id, 'Trip');
            await tx.ledgerEntry.updateMany({ where: withTenant(req, { tripId: id }), data: { deletedAt: new Date() } });
            await tx.trip.updateMany({ where: withTenant(req, { id }), data: { deletedAt: new Date() } });
        });
        res.json({ message: "Trip deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete trip." });
    }
});

module.exports = router;


