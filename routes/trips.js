const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

// SMART LEDGER SYNC ENGINE FOR ADVANCES
async function syncTripAdvanceLedger(req, trip, vehicle) {
    // 1. Wipe old advance ledger entries for this trip (for clean updates)
    await prisma.ledgerEntry.deleteMany({
        where: withTenant(req, { tripId: trip.id, narration: { contains: 'Advance' } })
    });

    if (trip.advancePaid > 0 && trip.advanceAccountId) {
        // 2. Credit the Bank/Cash Account (Money left your bank)
        await prisma.ledgerEntry.create({
            data: {
                date: trip.advanceDate || new Date(),
                tenantKey: req.tenantKey,
                accountId: trip.advanceAccountId,
                type: 'Cr',
                amount: trip.advancePaid,
                narration: `Trip Advance Paid - Trip No: ${trip.tripNo}`,
                tripId: trip.id
            }
        });

        // 3. Figure out who gets Debited (Who received the money?)
        let debitAccountId = null;
        if (vehicle?.ownershipType === 'Market' && vehicle.vendorAccountId) {
            debitAccountId = vehicle.vendorAccountId; // Debit Vendor
        } else if (trip.driverId) {
            const driverAcc = await prisma.account.findFirst({ where: withTenant(req, { driverId: trip.driverId }) });
            if (driverAcc) debitAccountId = driverAcc.id; // Debit Driver
        }

        // 4. Debit the receiver
        if (debitAccountId) {
            await prisma.ledgerEntry.create({
                data: {
                    date: trip.advanceDate || new Date(),
                    tenantKey: req.tenantKey,
                    accountId: debitAccountId,
                    type: 'Dr',
                    amount: trip.advancePaid,
                    narration: `Trip Advance Received - Trip No: ${trip.tripNo}`,
                    tripId: trip.id
                }
            });
        }
    }
}

// GET ALL TRIPS
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

// GET SINGLE TRIP
router.get('/:id', async (req, res) => {
    try {
        const trip = await prisma.trip.findFirst({
            where: withTenant(req, { id: parseInt(req.params.id) }),
            include: { company: true, route: true, vehicle: true, driver: true }
        });
        if (!trip) return res.status(404).json({ error: "Trip not found." });
        res.json(trip);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch the trip." });
    }
});

// CREATE TRIP
router.post('/', async (req, res) => {
    const d = req.body;
    try {
        const lastTrip = await prisma.trip.findFirst({ where: withTenant(req), orderBy: { id: 'desc' } });
        let nextSeq = 1;
        if (lastTrip && lastTrip.tripNo && lastTrip.tripNo.startsWith('TRP')) {
            const lastSeq = parseInt(lastTrip.tripNo.replace('TRP', ''), 10);
            if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
        }
        const tripNo = `TRP${nextSeq.toString().padStart(3, '0')}`;

        const trip = await prisma.trip.create({
            data: {
                tripNo,
                tenantKey: req.tenantKey,
                date: d.date ? new Date(d.date) : new Date(),
                companyId: parseInt(d.companyId),
                routeId: parseInt(d.routeId),
                vehicleId: parseInt(d.vehicleId),
                driverId: d.driverId ? parseInt(d.driverId) : null,
                
                length: parseFloat(d.length) || null,
                width: parseFloat(d.width) || null,
                height: parseFloat(d.height) || null,
                odcSize: parseFloat(d.odcSize) || null,
                clientOdcRate: parseFloat(d.clientOdcRate) || 0,
                vendorOdcRate: parseFloat(d.vendorOdcRate) || 0,
                clientExtraSizeCharge: parseFloat(d.clientExtraSizeCharge) || 0,
                vendorExtraSizeCharge: parseFloat(d.vendorExtraSizeCharge) || 0,

                haltingDays: parseFloat(d.haltingDays) || 0,
                clientHaltRate: parseFloat(d.clientHaltRate) || 0,
                vendorHaltRate: parseFloat(d.vendorHaltRate) || 0,
                haltingCharge: parseFloat(d.clientHaltingCharge) || 0,
                vendorHaltingCharge: parseFloat(d.vendorHaltingCharge) || 0,

                billWeight: parseFloat(d.billWeight) || 0,
                clientCalcType: d.clientCalcType || 'PerTon',
                clientRate: parseFloat(d.clientRate) || 0,
                vendorCalcType: d.vendorCalcType || 'PerTon',
                vendorRate: parseFloat(d.vendorRate) || 0,
                totalClientBill: parseFloat(d.totalClientBill) || 0,
                netTruckPayout: parseFloat(d.netTruckPayout) || 0,

                dieselAccountId: d.dieselPumpId ? parseInt(d.dieselPumpId) : null,
                dieselLiters: parseFloat(d.dieselLiters) || 0,
                dieselRate: parseFloat(d.dieselRate) || 0,
                dieselAmount: parseFloat(d.dieselAmount) || 0,
                
                advanceAccountId: d.advanceAccountId ? parseInt(d.advanceAccountId) : null,
                advanceDate: d.advanceDate ? new Date(d.advanceDate) : null,
                advancePaid: parseFloat(d.advancePaid) || 0,

                status: d.status || 'In-Transit'
            }
        });

        const vehicle = await prisma.vehicle.findFirst({ where: withTenant(req, { id: parseInt(d.vehicleId) }) });
        await syncTripAdvanceLedger(req, trip, vehicle);

        res.json(trip);
    } catch (error) {
        console.error("Trip Create Error:", error);
        res.status(400).json({ error: error.message || "Failed to create trip." });
    }
});

// UPDATE TRIP
router.put('/:id', async (req, res) => {
    const d = req.body;
    try {
        const trip = await prisma.trip.update({
            where: withTenant(req, { id: parseInt(req.params.id) }),
            data: {
                date: d.date ? new Date(d.date) : undefined,
                companyId: parseInt(d.companyId),
                routeId: parseInt(d.routeId),
                vehicleId: parseInt(d.vehicleId),
                driverId: d.driverId ? parseInt(d.driverId) : null,
                
                length: parseFloat(d.length) || null,
                width: parseFloat(d.width) || null,
                height: parseFloat(d.height) || null,
                odcSize: parseFloat(d.odcSize) || null,
                clientOdcRate: parseFloat(d.clientOdcRate) || 0,
                vendorOdcRate: parseFloat(d.vendorOdcRate) || 0,
                clientExtraSizeCharge: parseFloat(d.clientExtraSizeCharge) || 0,
                vendorExtraSizeCharge: parseFloat(d.vendorExtraSizeCharge) || 0,

                haltingDays: parseFloat(d.haltingDays) || 0,
                clientHaltRate: parseFloat(d.clientHaltRate) || 0,
                vendorHaltRate: parseFloat(d.vendorHaltRate) || 0,
                haltingCharge: parseFloat(d.clientHaltingCharge) || 0,
                vendorHaltingCharge: parseFloat(d.vendorHaltingCharge) || 0,

                billWeight: parseFloat(d.billWeight) || 0,
                commission: parseFloat(d.commission) || 0,
                clientCalcType: d.clientCalcType || 'PerTon',
                clientRate: parseFloat(d.clientRate) || 0,
                vendorCalcType: d.vendorCalcType || 'PerTon',
                vendorRate: parseFloat(d.vendorRate) || 0,
                totalClientBill: parseFloat(d.totalClientBill) || 0,
                netTruckPayout: parseFloat(d.netTruckPayout) || 0,

                dieselAccountId: d.dieselPumpId ? parseInt(d.dieselPumpId) : null,
                dieselLiters: parseFloat(d.dieselLiters) || 0,
                dieselRate: parseFloat(d.dieselRate) || 0,
                dieselAmount: parseFloat(d.dieselAmount) || 0,
                
                advanceAccountId: d.advanceAccountId ? parseInt(d.advanceAccountId) : null,
                advanceDate: d.advanceDate ? new Date(d.advanceDate) : null,
                advancePaid: parseFloat(d.advancePaid) || 0,
                
                status: d.status
            }
        });

        const vehicle = await prisma.vehicle.findFirst({ where: withTenant(req, { id: parseInt(d.vehicleId) }) });
        await syncTripAdvanceLedger(req, trip, vehicle);

        res.json(trip);
    } catch (error) {
        console.error("Trip Update Error:", error);
        res.status(400).json({ error: error.message || "Failed to update trip." });
    }
});

// DELETE TRIP
router.delete('/:id', async (req, res) => {
    try {
        await prisma.ledgerEntry.deleteMany({ where: withTenant(req, { tripId: parseInt(req.params.id) }) });
        await prisma.trip.deleteMany({ where: withTenant(req, { id: parseInt(req.params.id) }) });
        res.json({ message: "Trip deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete trip." });
    }
});

module.exports = router;
