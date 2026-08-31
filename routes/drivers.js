const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureDriverAdvanceAccount } = require('../lib/accountingAccounts');
const { toRequiredInt, toDate, toRequiredDate, text } = require('../lib/coerce');
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
        const result = await prisma.$transaction(async (tx) => {
            if (!text(d.name)) throw new Error('Driver name is required.');
            if (!text(d.licenseNo)) throw new Error('License number is required.');
            if (!text(d.aadhaarNumber)) throw new Error('Aadhaar number is required.');
            const newDriver = await tx.driver.create({
                data: {
                    name: text(d.name),
                    tenantKey: req.tenantKey,
                    licenseNo: text(d.licenseNo),
                    licenseExpiry: toRequiredDate(d.licenseExpiry, 'License expiry'),
                    hazmatLicense: d.hazmatLicense || false,
                    hazmatExpiry: toDate(d.hazmatExpiry),
                    address: text(d.address, null),
                    phone: text(d.phone),
                    aadhaarNumber: text(d.aadhaarNumber),
                    status: d.status || 'Active'
                }
            });

            await ensureDriverAdvanceAccount(tx, req, newDriver);
            return newDriver;
        });

        res.json(result);
    } catch (error) {
        console.error("Driver Creation Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "A driver with this License, Aadhaar, or linked ledger already exists." });
        res.status(400).json({ error: "Failed to create driver." });
    }
});

// UPDATE DRIVER & SYNC LEDGER NAME
router.put('/:id', async (req, res) => {
    const d = req.body;
    
    try {
        const driverId = toRequiredInt(req.params.id, 'Driver');
        const result = await prisma.$transaction(async (tx) => {
            const updatedDriver = await tx.driver.update({
                where: withTenant(req, { id: driverId }),
                data: {
                    name: text(d.name),
                    licenseNo: text(d.licenseNo),
                    licenseExpiry: toRequiredDate(d.licenseExpiry, 'License expiry'),
                    hazmatLicense: d.hazmatLicense,
                    hazmatExpiry: toDate(d.hazmatExpiry),
                    address: text(d.address, null),
                    phone: text(d.phone),
                    aadhaarNumber: text(d.aadhaarNumber),
                    status: d.status
                }
            });

            await ensureDriverAdvanceAccount(tx, req, updatedDriver);
            return updatedDriver;
        });
        
        res.json(result);
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ error: "License, Aadhaar, or linked ledger already in use." });
        res.status(400).json({ error: "Failed to update driver." });
    }
});

// DELETE DRIVER
router.delete('/:id', async (req, res) => {
    try {
        const driverId = toRequiredInt(req.params.id, 'Driver');
        await prisma.$transaction(async (tx) => {
            const linkedAccount = await tx.account.findFirst({ where: withTenant(req, { driverId: driverId }) });
            if (linkedAccount) {
                await tx.account.update({ where: { id: linkedAccount.id }, data: { deletedAt: new Date() } });
            }
            await tx.driver.updateMany({ where: withTenant(req, { id: driverId }), data: { deletedAt: new Date() } });
        });
        res.json({ message: "Driver and linked account deleted." });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(400).json({ error: "Cannot delete driver. They likely have active trips or ledger transactions." });
    }
});

module.exports = router;
