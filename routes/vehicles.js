const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureMarketVendorAccount } = require('../lib/accountingAccounts');
const { toNumber, toInt, toRequiredInt, toDate, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

function vehiclePayload(req, d) {
    const isMarket = d.ownershipType === 'Market';
    return {
        regNo: text(d.regNo),
        type: text(d.type, null),
        capacityTon: toNumber(d.capacityTon),
        tenantKey: req.tenantKey,
        ownershipType: d.ownershipType,
        ownerName: d.ownerName,
        status: d.status || 'Active',
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
        fitmentDetails: d.fitmentDetails,
        sv1Num: d.sv1Num,
        sv2Num: d.sv2Num,
        sv3Num: d.sv3Num,
        iv1Num: d.iv1Num,
        iv2Num: d.iv2Num,
        iv3Num: d.iv3Num,
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
            const createdVehicle = await tx.vehicle.create({ data: vehiclePayload(req, d) });
            return attachAutoVendorAccount(tx, req, createdVehicle);
        });
        res.json(vehicle);
    } catch (error) {
        console.error("Vehicle Create Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "Vehicle registration number or vendor ledger already exists." });
        res.status(400).json({ error: "Failed to create vehicle." });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const d = req.body;
        const vehicle = await prisma.$transaction(async (tx) => {
            const updatedVehicle = await tx.vehicle.update({
                where: withTenant(req, { id: toRequiredInt(req.params.id, 'Vehicle') }),
                data: vehiclePayload(req, d)
            });
            return attachAutoVendorAccount(tx, req, updatedVehicle);
        });
        res.json(vehicle);
    } catch (error) {
        console.error("Vehicle Update Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "Vehicle registration number or vendor ledger already exists." });
        res.status(400).json({ error: "Failed to update vehicle." });
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
