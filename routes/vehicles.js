const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
    try {
        const vehicles = await prisma.vehicle.findMany({ 
            where: withTenant(req),
            include: { vendorAccount: true }, // Pull the linked ledger profile
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
        const vehicle = await prisma.vehicle.create({
            data: {
                regNo: d.regNo, type: d.type, capacityTon: parseFloat(d.capacityTon || 0),
                tenantKey: req.tenantKey,
                ownershipType: d.ownershipType, ownerName: d.ownerName, status: d.status || 'Active',
                vendorAccountId: d.vendorAccountId ? parseInt(d.vendorAccountId) : null, // Save ledger link
                regDate: d.regDate ? new Date(d.regDate) : null,
                fcExpiry: d.fcExpiry ? new Date(d.fcExpiry) : null,
                permit1YrExpiry: d.permit1YrExpiry ? new Date(d.permit1YrExpiry) : null,
                permit5YrExpiry: d.permit5YrExpiry ? new Date(d.permit5YrExpiry) : null,
                qTaxExpiry: d.qTaxExpiry ? new Date(d.qTaxExpiry) : null,
                pucExpiry: d.pucExpiry ? new Date(d.pucExpiry) : null,
                rule18Expiry: d.rule18Expiry ? new Date(d.rule18Expiry) : null,
                rule19Expiry: d.rule19Expiry ? new Date(d.rule19Expiry) : null,
                rule43Expiry: d.rule43Expiry ? new Date(d.rule43Expiry) : null,
                pesoExpiry: d.pesoExpiry ? new Date(d.pesoExpiry) : null,
                fitmentDetails: d.fitmentDetails,
                sv1Num: d.sv1Num, sv2Num: d.sv2Num, sv3Num: d.sv3Num,
                iv1Num: d.iv1Num, iv2Num: d.iv2Num, iv3Num: d.iv3Num
            }
        });
        res.json(vehicle);
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ error: "Vehicle Registration Number already exists." });
        res.status(400).json({ error: "Failed to create vehicle." });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const d = req.body;
        const vehicle = await prisma.vehicle.update({
            where: withTenant(req, { id: parseInt(req.params.id) }),
            data: {
                regNo: d.regNo, type: d.type, capacityTon: parseFloat(d.capacityTon || 0),
                ownershipType: d.ownershipType, ownerName: d.ownerName, status: d.status || 'Active',
                vendorAccountId: d.vendorAccountId ? parseInt(d.vendorAccountId) : null, // Update ledger link
                regDate: d.regDate ? new Date(d.regDate) : null,
                fcExpiry: d.fcExpiry ? new Date(d.fcExpiry) : null,
                permit1YrExpiry: d.permit1YrExpiry ? new Date(d.permit1YrExpiry) : null,
                permit5YrExpiry: d.permit5YrExpiry ? new Date(d.permit5YrExpiry) : null,
                qTaxExpiry: d.qTaxExpiry ? new Date(d.qTaxExpiry) : null,
                pucExpiry: d.pucExpiry ? new Date(d.pucExpiry) : null,
                rule18Expiry: d.rule18Expiry ? new Date(d.rule18Expiry) : null,
                rule19Expiry: d.rule19Expiry ? new Date(d.rule19Expiry) : null,
                rule43Expiry: d.rule43Expiry ? new Date(d.rule43Expiry) : null,
                pesoExpiry: d.pesoExpiry ? new Date(d.pesoExpiry) : null,
                fitmentDetails: d.fitmentDetails,
                sv1Num: d.sv1Num, sv2Num: d.sv2Num, sv3Num: d.sv3Num,
                iv1Num: d.iv1Num, iv2Num: d.iv2Num, iv3Num: d.iv3Num
            }
        });
        res.json(vehicle);
    } catch (error) {
        res.status(400).json({ error: "Failed to update vehicle." });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.vehicle.updateMany({ where: withTenant(req, { id: parseInt(req.params.id) }), data: { deletedAt: new Date() } });
        res.json({ message: "Vehicle deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete vehicle. It may be in use." });
    }
});

module.exports = router;
