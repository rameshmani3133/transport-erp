const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureClientLedgerAccount, ensureClientLedgerAccounts } = require('../lib/accountingAccounts');
const { toRequiredInt, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

// GET ALL CLIENT COMPANIES
router.get('/', async (req, res) => {
    try {
        await ensureClientLedgerAccounts(prisma, req);
        const companies = await prisma.clientCompany.findMany({
            where: withTenant(req),
            orderBy: { id: 'desc' }
        });
        res.json(companies);
    } catch (error) {
        console.error("Client Company Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch client companies." });
    }
});

// CREATE NEW CLIENT COMPANY
router.post('/', async (req, res) => {
    try {
        const newCompany = await prisma.$transaction(async (tx) => {
            if (!text(req.body.companyName)) throw new Error('Company name is required.');
            const company = await tx.clientCompany.create({
                data: {
                    companyName: text(req.body.companyName),
                    tenantKey: req.tenantKey,
                    panNumber: req.body.panNumber || null,
                    status: req.body.status || 'Active'
                }
            });
            await ensureClientLedgerAccount(tx, req, company);
            return company;
        });
        res.json(newCompany);
    } catch (error) {
        console.error("Client Company Create Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "Company name or linked ledger already exists." });
        res.status(400).json({ error: error.message || "Failed to create company." });
    }
});

// UPDATE CLIENT COMPANY
router.put('/:id', async (req, res) => {
    try {
        const companyId = toRequiredInt(req.params.id, 'Client company');
        const updatedCompany = await prisma.$transaction(async (tx) => {
            const company = await tx.clientCompany.update({
                where: withTenant(req, { id: companyId }),
                data: {
                    companyName: text(req.body.companyName),
                    panNumber: req.body.panNumber || null,
                    status: req.body.status || 'Active'
                }
            });
            await ensureClientLedgerAccount(tx, req, company);
            return company;
        });
        res.json(updatedCompany);
    } catch (error) {
        console.error("Client Company Update Error:", error);
        res.status(400).json({ error: error.message || "Failed to update company." });
    }
});

// DELETE CLIENT COMPANY
router.delete('/:id', async (req, res) => {
    try {
        await prisma.clientCompany.updateMany({ where: withTenant(req, { id: toRequiredInt(req.params.id, 'Client company') }), data: { deletedAt: new Date() } });
        res.json({ message: "Company deleted successfully." });
    } catch (error) {
        console.error("Client Company Delete Error:", error);
        res.status(400).json({ error: "Failed to delete company. It may be linked to a route or location." });
    }
});

module.exports = router;
