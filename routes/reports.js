const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/summary', async (req, res) => {
    try {
        // 1. Receivables (Unpaid Invoices)
        const unpaidInvoices = await prisma.invoice.aggregate({
            where: withTenant(req, { status: 'Unpaid' }),
            _sum: { balanceAmount: true }
        });

        // 2. Payables (Unpaid Vendor Settlements)
        const unpaidSettlements = await prisma.vendorSettlement.aggregate({
            where: withTenant(req, { status: 'Unpaid' }),
            _sum: { netPayable: true }
        });

        // 3. Profitability (All Completed Trips)
        const allTrips = await prisma.trip.findMany({
            where: withTenant(req, { status: { in: ['Completed', 'Billed'] } })
        });

        let totalRevenue = 0;
        let totalExpense = 0;

        allTrips.forEach(t => {
            totalRevenue += (t.totalClientBill || 0);
            totalExpense += (t.netTruckPayout || 0) + (t.dieselAmount || 0);
        });

        res.json({
            receivables: unpaidInvoices._sum.balanceAmount || 0,
            payables: unpaidSettlements._sum.netPayable || 0,
            totalRevenue,
            totalExpense,
            grossMargin: totalRevenue - totalExpense,
            tripsCount: allTrips.length
        });
    } catch (error) {
        console.error("Reports Error:", error);
        res.status(500).json({ error: "Failed to generate reports." });
    }
});

module.exports = router;
