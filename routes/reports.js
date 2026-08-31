const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

function balanceFor(account) {
    return (account.openingBalance || 0) + account.entries.reduce((sum, e) => {
        if (account.balanceType === 'Dr') return sum + (e.type === 'Dr' ? e.amount : -e.amount);
        return sum + (e.type === 'Cr' ? e.amount : -e.amount);
    }, 0);
}

router.get('/summary', async (req, res) => {
    try {
        const [accounts, trips, invoices] = await Promise.all([
            prisma.account.findMany({ where: withTenant(req), include: { entries: { where: { deletedAt: null } } } }),
            prisma.trip.findMany({ where: withTenant(req) }),
            prisma.invoice.findMany({ where: withTenant(req) })
        ]);

        const enriched = accounts.map(account => ({ ...account, currentBalance: balanceFor(account) }));
        const revenue = enriched.filter(a => a.accountType === 'Income').reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);
        const expenses = enriched.filter(a => a.accountType === 'Expense').reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);
        const receivables = enriched.filter(a => a.accountGroup?.includes('Sundry Debtors')).reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);
        const payables = enriched.filter(a => a.accountGroup?.includes('Sundry Creditors')).reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);
        const taxPayable = enriched.filter(a => a.accountGroup === 'Duties & Taxes').reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);

        res.json({
            receivables,
            payables,
            taxPayable,
            totalRevenue: revenue,
            totalExpense: expenses,
            grossMargin: revenue - expenses,
            tripsCount: trips.length,
            invoicesCount: invoices.length
        });
    } catch (error) {
        console.error("Reports Error:", error);
        res.status(500).json({ error: "Failed to generate reports." });
    }
});

module.exports = router;
