const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureStandardAccountingAccounts } = require('../lib/accountingAccounts');
const { toNumber, toInt, toRequiredInt, toDate, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

function normalizeVoucherId(value) {
    return String(value || '').trim();
}

// 1. GET ALL ACCOUNTS & CALCULATE LIVE BALANCES
router.get('/accounts', async (req, res) => {
    try {
        await ensureStandardAccountingAccounts(prisma, req);
        const accounts = await prisma.account.findMany({
            where: withTenant(req),
            include: { entries: { where: { deletedAt: null } } },
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
            where: withTenant(req, { accountId: toRequiredInt(req.params.accountId, 'Account') }),
            include: { trip: true, invoice: true, settlement: true, diesel: true, driverSettlement: true },
            orderBy: { date: 'desc' }
        });
        res.json(txns);
    } catch (error) {
        console.error("Transaction Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch transactions." });
    }
});

// 3. POST MANUAL DOUBLE-ENTRY VOUCHER
router.post('/manual', async (req, res) => {
    try {
        const debitAccountId = toInt(req.body.debitAccountId || req.body.accountId);
        const creditAccountId = toInt(req.body.creditAccountId);
        const amount = toNumber(req.body.amount);
        if (!Number.isInteger(debitAccountId) || !Number.isInteger(creditAccountId) || debitAccountId === creditAccountId) {
            return res.status(400).json({ error: 'Select different debit and credit accounts.' });
        }
        if (amount <= 0) return res.status(400).json({ error: 'Amount must be greater than zero.' });

        const voucherId = `MV-${Date.now()}`;
        const date = toDate(req.body.date, new Date());
        const narration = text(req.body.narration, 'Manual Voucher Entry') || 'Manual Voucher Entry';
        const entries = await prisma.$transaction(async (tx) => tx.ledgerEntry.createMany({
            data: [
                { date, tenantKey: req.tenantKey, accountId: debitAccountId, type: 'Dr', amount, narration: `${narration} [${voucherId}]` },
                { date, tenantKey: req.tenantKey, accountId: creditAccountId, type: 'Cr', amount, narration: `${narration} [${voucherId}]` }
            ]
        }));
        res.json({ voucherId, entries });
    } catch (error) {
        console.error('Manual Voucher Error:', error);
        res.status(400).json({ error: "Failed to post voucher." });
    }
});

// 4. UPDATE MANUAL VOUCHER SIDE BY ENTRY ID
router.put('/manual/:id', async (req, res) => {
    return res.status(403).json({ error: 'Manual vouchers cannot be edited one side at a time. Delete and repost the voucher.' });
});

// 5. DELETE MANUAL VOUCHER SIDE BY ENTRY ID
router.delete('/manual/:id', async (req, res) => {
    try {
        const existing = await prisma.ledgerEntry.findFirst({ where: withTenant(req, { id: toRequiredInt(req.params.id, 'Ledger entry') }) });
        if (!existing) return res.status(404).json({ error: "Entry not found." });
        if (existing.tripId || existing.invoiceId || existing.settlementId || existing.dieselId || existing.driverSettlementId) {
            return res.status(403).json({ error: "Cannot delete an automated system entry." });
        }
        const match = normalizeVoucherId(existing.narration).match(/\[(MV-\d+)\]$/);
        if (match) {
            await prisma.ledgerEntry.updateMany({ where: withTenant(req, { narration: { contains: `[${match[1]}]` } }), data: { deletedAt: new Date() } });
        } else {
            await prisma.ledgerEntry.updateMany({ where: withTenant(req, { id: existing.id }), data: { deletedAt: new Date() } });
        }
        res.json({ message: "Voucher deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete entry." });
    }
});

// ACCOUNT MASTER CRUD
router.post('/account', async (req, res) => {
    try {
        if (!text(req.body.accountName)) throw new Error('Account name is required.');
        if (!text(req.body.accountType)) throw new Error('Account type is required.');
        if (!text(req.body.accountGroup)) throw new Error('Account group is required.');
        const account = await prisma.account.create({
            data: {
                accountName: text(req.body.accountName),
                tenantKey: req.tenantKey,
                accountType: text(req.body.accountType),
                accountGroup: text(req.body.accountGroup),
                openingBalance: toNumber(req.body.openingBalance),
                balanceType: req.body.balanceType || 'Dr'
            }
        });
        res.json(account);
    } catch (error) {
        console.error("Account Creation Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "An account with this exact name already exists." });
        res.status(400).json({ error: "Failed to create account." });
    }
});

router.put('/account/:id', async (req, res) => {
    try {
        if (!text(req.body.accountName)) throw new Error('Account name is required.');
        if (!text(req.body.accountType)) throw new Error('Account type is required.');
        if (!text(req.body.accountGroup)) throw new Error('Account group is required.');
        const account = await prisma.account.update({
            where: withTenant(req, { id: toRequiredInt(req.params.id, 'Account') }),
            data: {
                accountName: text(req.body.accountName),
                accountType: text(req.body.accountType),
                accountGroup: text(req.body.accountGroup),
                openingBalance: toNumber(req.body.openingBalance),
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

router.delete('/account/:id', async (req, res) => {
    try {
        await prisma.account.updateMany({ where: withTenant(req, { id: toRequiredInt(req.params.id, 'Account') }), data: { deletedAt: new Date() } });
        res.json({ message: "Account deleted successfully." });
    } catch (error) {
        console.error("Account Delete Error:", error);
        res.status(400).json({ error: "Cannot delete this account because it has active transactions tied to it." });
    }
});

module.exports = router;

