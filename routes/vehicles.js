const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureMarketVendorAccount } = require('../lib/accountingAccounts');
const { toNumber, toInt, toRequiredInt, toDate, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

function vehiclePayload(req, d) {
    const isMarket = d.ownershipType === 'Market';
    const ownerName = text(d.ownerName, null);
    return {
        regNo: text(d.regNo),
        type: text(d.type, null),
        capacityTon: toNumber(d.capacityTon),
        tenantKey: req.tenantKey,
        ownershipType: text(d.ownershipType, 'Owned') || 'Owned',
        ownerName,
        status: text(d.status, 'Active') || 'Active',
        vendorAccountId: isMarket ? toInt(d.vendorAccountId) : null,
        regDate: toDate(d.regDate),
        fcExpiry: toDate(d.fcExpiry),
        permit1YrExpiry: toDate(d.permit1YrExpiry),
        permit5YrExpiry: toDate(d.permit5YrExpiry),
        qTaxExpiry: toDate(d.qTaxExpiry),
        pucExpiry: toDate(d.pucExpiry),
        insuranceExpiry: toDate(d.insuranceExpiry),
        cllExpiry: toDate(d.cllExpiry),
        pliExpiry: toDate(d.pliExpiry),
        explosiveExpiry: toDate(d.explosiveExpiry),
        rule18Expiry: toDate(d.rule18Expiry),
        rule19Expiry: toDate(d.rule19Expiry),
        rule43Expiry: toDate(d.rule43Expiry),
        pesoExpiry: toDate(d.pesoExpiry),
        fitmentDetails: text(d.fitmentDetails, null),
        sv1Num: text(d.sv1Num, null),
        sv2Num: text(d.sv2Num, null),
        sv3Num: text(d.sv3Num, null),
        iv1Num: text(d.iv1Num, null),
        iv2Num: text(d.iv2Num, null),
        iv3Num: text(d.iv3Num, null),
        sv1Expiry: toDate(d.sv1Expiry),
        sv2Expiry: toDate(d.sv2Expiry),
        sv3Expiry: toDate(d.sv3Expiry),
        iv1Expiry: toDate(d.iv1Expiry),
        iv2Expiry: toDate(d.iv2Expiry),
        iv3Expiry: toDate(d.iv3Expiry)
    };
}

async function attachAutoVendorAccount(tx, req, vehicle) {
    const vendorAccount = await ensureMarketVendorAccount(tx, req, vehicle);
    if (!vendorAccount || vehicle.vendorAccountId === vendorAccount.id) return vehicle;

    return tx.vehicle.update({
        where: { id: vehicle.id },
        data: { vendorAccountId: vendorAccount.id }
    });
}

router.get('/', async (req, res) => {
    try {
        const vehicles = await prisma.vehicle.findMany({ 
            where: withTenant(req),
            include: { vendorAccount: true },
            orderBy: { id: 'desc' } 
        });
        res.json(vehicles);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch vehicles." });
    }
});

router.post('/', async (req, res) => {
    try {
        const d = req.body;
        const vehicle = await prisma.$transaction(async (tx) => {
            if (!text(d.regNo)) throw new Error('Registration number is required.');
            if (d.ownershipType === 'Market' && !text(d.ownerName)) throw new Error('Owner name is required for market vehicles.');
            const createdVehicle = await tx.vehicle.create({ data: vehiclePayload(req, d) });
            const linkedVehicle = await attachAutoVendorAccount(tx, req, createdVehicle);
            return tx.vehicle.findFirst({ where: withTenant(req, { id: linkedVehicle.id }), include: { vendorAccount: true } });
        });
        res.json(vehicle);
    } catch (error) {
        console.error("Vehicle Create Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "Vehicle registration number or vendor ledger already exists." });
        res.status(400).json({ error: error.message || "Failed to create vehicle." });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const d = req.body;
        const vehicle = await prisma.$transaction(async (tx) => {
            if (!text(d.regNo)) throw new Error('Registration number is required.');
            if (d.ownershipType === 'Market' && !text(d.ownerName)) throw new Error('Owner name is required for market vehicles.');
            const updatedVehicle = await tx.vehicle.update({
                where: withTenant(req, { id: toRequiredInt(req.params.id, 'Vehicle') }),
                data: vehiclePayload(req, d)
            });
            const linkedVehicle = await attachAutoVendorAccount(tx, req, updatedVehicle);
            return tx.vehicle.findFirst({ where: withTenant(req, { id: linkedVehicle.id }), include: { vendorAccount: true } });
        });
        res.json(vehicle);
    } catch (error) {
        console.error("Vehicle Update Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "Vehicle registration number or vendor ledger already exists." });
        res.status(400).json({ error: error.message || "Failed to update vehicle." });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.vehicle.updateMany({ where: withTenant(req, { id: toRequiredInt(req.params.id, 'Vehicle') }), data: { deletedAt: new Date() } });
        res.json({ message: "Vehicle deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete vehicle. It may be in use." });
    }
});

module.exports = router;
