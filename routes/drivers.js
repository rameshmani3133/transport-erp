const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

// GET ALL DRIVERS
router.get('/', async (req, res) => {
    try {
        const drivers = await prisma.driver.findMany({ where: withTenant(req), orderBy: { id: 'desc' } });
        res.json(drivers);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch drivers." });
    }
});

// CREATE DRIVER & AUTO-CREATE LEDGER ACCOUNT
router.post('/', async (req, res) => {
    const d = req.body;
    try {
        // Use a transaction to ensure both records are created together
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create the Driver
            const newDriver = await tx.driver.create({
                data: {
                    name: d.name,
                    tenantKey: req.tenantKey,
                    licenseNo: d.licenseNo,
                    licenseExpiry: new Date(d.licenseExpiry),
                    hazmatLicense: d.hazmatLicense || false,
                    hazmatExpiry: d.hazmatExpiry ? new Date(d.hazmatExpiry) : null,
                    address: d.address,
                    phone: d.phone,
                    aadhaarNumber: d.aadhaarNumber,
                    status: d.status || 'Active'
                }
            });

            // 2. Auto-Create the Ledger Account for Driver Advances
            await tx.account.create({
                data: {
                    accountName: `${newDriver.name} - Driver Advance`,
                    tenantKey: req.tenantKey,
                    accountType: 'Asset',
                    accountGroup: 'Loans & Advances (Asset)', 
                    driverId: newDriver.id, // Links directly to the driver
                    openingBalance: 0,
                    balanceType: 'Dr' // Advances are always debit balances
                }
            });

            return newDriver;
        });

        res.json(result);
    } catch (error) {
        console.error("Driver Creation Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "A driver with this License or ID already exists." });
        res.status(400).json({ error: "Failed to create driver." });
    }
});

// UPDATE DRIVER & SYNC LEDGER NAME
router.put('/:id', async (req, res) => {
    const d = req.body;
    const driverId = parseInt(req.params.id);
    
    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update the Driver
            const updatedDriver = await tx.driver.update({
                where: withTenant(req, { id: driverId }),
                data: {
                    name: d.name,
                    licenseNo: d.licenseNo,
                    licenseExpiry: new Date(d.licenseExpiry),
                    hazmatLicense: d.hazmatLicense,
                    hazmatExpiry: d.hazmatExpiry ? new Date(d.hazmatExpiry) : null,
                    address: d.address,
                    phone: d.phone,
                    aadhaarNumber: d.aadhaarNumber,
                    status: d.status
                }
            });

            // 2. If the driver's name changed, update their Ledger Account name to match
            const linkedAccount = await tx.account.findFirst({ where: withTenant(req, { driverId: driverId }) });
            if (linkedAccount) {
                await tx.account.update({
                    where: { id: linkedAccount.id },
                    data: { accountName: `${updatedDriver.name} - Driver Advance` }
                });
            }

            return updatedDriver;
        });
        
        res.json(result);
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ error: "License or ID already in use." });
        res.status(400).json({ error: "Failed to update driver." });
    }
});

// DELETE DRIVER
router.delete('/:id', async (req, res) => {
    const driverId = parseInt(req.params.id);
    try {
        await prisma.$transaction(async (tx) => {
            // Must delete the linked ledger account first to satisfy database constraints
            const linkedAccount = await tx.account.findFirst({ where: withTenant(req, { driverId: driverId }) });
            if (linkedAccount) {
                await tx.account.update({ where: { id: linkedAccount.id }, data: { deletedAt: new Date() } });
            }
            // Now safe to delete the driver
            await tx.driver.updateMany({ where: withTenant(req, { id: driverId }), data: { deletedAt: new Date() } });
        });
        res.json({ message: "Driver and linked account deleted." });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(400).json({ error: "Cannot delete driver. They likely have active trips or ledger transactions." });
    }
});

module.exports = router;

