const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

// 1. GET ALL ACCOUNTS & CALCULATE LIVE BALANCES
router.get('/accounts', async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({
            where: withTenant(req),
            include: { entries: true },
            orderBy: { accountName: 'asc' }
        });
        
        const enrichedAccounts = accounts.map(acc => {
            let currentBalance = acc.openingBalance || 0;
            acc.entries.forEach(e => {
                if (acc.balanceType === 'Dr') {
                    currentBalance += (e.type === 'Dr' ? e.amount : -e.amount);
                } else {
                    currentBalance += (e.type === 'Cr' ? e.amount : -e.amount);
                }
            });
            // Remove full entries array from payload to keep it lightweight
            const { entries, ...accountData } = acc;
            return { ...accountData, currentBalance };
        });
        
        res.json(enrichedAccounts);
    } catch (error) {
        console.error("Account Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch accounts." });
    }
});

// 2. GET ACCOUNT STATEMENT (TRANSACTIONS)
router.get('/transactions/:accountId', async (req, res) => {
    try {
        const txns = await prisma.ledgerEntry.findMany({
            where: withTenant(req, { accountId: parseInt(req.params.accountId) }),
            include: { trip: true, invoice: true, settlement: true, diesel: true },
            orderBy: { date: 'desc' } // Sort newest first
        });
        res.json(txns);
    } catch (error) {
        console.error("Transaction Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch transactions." });
    }
});

// 3. POST MANUAL DIRECT LEDGER ENTRY
router.post('/manual', async (req, res) => {
    try {
        const entry = await prisma.ledgerEntry.create({
            data: {
                date: req.body.date ? new Date(req.body.date) : new Date(),
                tenantKey: req.tenantKey,
                accountId: parseInt(req.body.accountId),
                type: req.body.type,
                amount: parseFloat(req.body.amount || 0),
                narration: req.body.narration || 'Manual Voucher Entry'
            }
        });
        res.json(entry);
    } catch (error) {
        res.status(400).json({ error: "Failed to post entry." });
    }
});

// 4. UPDATE MANUAL ENTRY
router.put('/manual/:id', async (req, res) => {
    try {
        // Security Check: Ensure it's not tied to an automated module
        const existing = await prisma.ledgerEntry.findFirst({ where: withTenant(req, { id: parseInt(req.params.id) }) });
        if (!existing) return res.status(404).json({ error: "Entry not found." });
        if (existing.tripId || existing.invoiceId || existing.settlementId || existing.dieselId) {
            return res.status(403).json({ error: "Cannot edit an automated system entry." });
        }

        const entry = await prisma.ledgerEntry.update({
            where: withTenant(req, { id: parseInt(req.params.id) }),
            data: {
                date: req.body.date ? new Date(req.body.date) : new Date(),
                accountId: parseInt(req.body.accountId),
                type: req.body.type,
                amount: parseFloat(req.body.amount || 0),
                narration: req.body.narration
            }
        });
        res.json(entry);
    } catch (error) {
        res.status(400).json({ error: "Failed to update entry." });
    }
});

// 5. DELETE MANUAL ENTRY
router.delete('/manual/:id', async (req, res) => {
    try {
        const existing = await prisma.ledgerEntry.findFirst({ where: withTenant(req, { id: parseInt(req.params.id) }) });
        if (!existing) return res.status(404).json({ error: "Entry not found." });
        if (existing.tripId || existing.invoiceId || existing.settlementId || existing.dieselId) {
            return res.status(403).json({ error: "Cannot delete an automated system entry." });
        }
        await prisma.ledgerEntry.deleteMany({ where: withTenant(req, { id: parseInt(req.params.id) }) });
        res.json({ message: "Entry deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete entry." });
    }
});

// ==========================================
// ACCOUNT MASTER CRUD (CREATE, UPDATE, DELETE)
// ==========================================

// CREATE NEW ACCOUNT
router.post('/account', async (req, res) => {
    try {
        const account = await prisma.account.create({
            data: {
                accountName: req.body.accountName,
                tenantKey: req.tenantKey,
                accountType: req.body.accountType,
                accountGroup: req.body.accountGroup,
                openingBalance: parseFloat(req.body.openingBalance || 0),
                balanceType: req.body.balanceType || 'Dr'
            }
        });
        res.json(account);
    } catch (error) {
        console.error("Account Creation Error:", error);
        // P2002 is Prisma's error code for "Unique constraint failed"
        if (error.code === 'P2002') return res.status(400).json({ error: "An account with this exact name already exists." });
        res.status(400).json({ error: "Failed to create account." });
    }
});

// UPDATE EXISTING ACCOUNT
router.put('/account/:id', async (req, res) => {
    try {
        const account = await prisma.account.update({
            where: withTenant(req, { id: parseInt(req.params.id) }),
            data: {
                accountName: req.body.accountName,
                accountType: req.body.accountType,
                accountGroup: req.body.accountGroup,
                openingBalance: parseFloat(req.body.openingBalance || 0),
                balanceType: req.body.balanceType || 'Dr'
            }
        });
        res.json(account);
    } catch (error) {
        console.error("Account Update Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "An account with this name already exists." });
        res.status(400).json({ error: "Failed to update account." });
    }
});

// DELETE ACCOUNT
router.delete('/account/:id', async (req, res) => {
    try {
        await prisma.account.deleteMany({ where: withTenant(req, { id: parseInt(req.params.id) }) });
        res.json({ message: "Account deleted successfully." });
    } catch (error) {
        console.error("Account Delete Error:", error);
        // If an account is used in a Trip, Invoice, or Ledger Entry, Prisma blocks deletion to protect your data.
        res.status(400).json({ error: "Cannot delete this account because it has active transactions tied to it." });
    }
});

module.exports = router;
