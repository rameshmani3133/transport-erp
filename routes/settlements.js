const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureStandardAccountingAccounts, ensureVendorDieselAccount } = require('../lib/accountingAccounts');
const { toNumber, toInt, toRequiredInt, toDate } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
    try {
        const settlements = await prisma.vendorSettlement.findMany({
            where: withTenant(req),
            include: { vehicle: true, vendor: true, trips: true },
            orderBy: { id: 'desc' }
        });
        res.json(settlements);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch settlements." });
    }
});

router.post('/', async (req, res) => {
    const d = req.body;
    try {
        const settlement = await prisma.$transaction(async (tx) => {
            const vendorId = toInt(d.vendorId);
            const tripIds = (d.tripIds || []).map(id => toInt(id)).filter(id => Number.isInteger(id));
            if (!vendorId) throw new Error('Vendor ledger is required.');
            if (!tripIds.length) throw new Error('Select at least one trip to settle.');

            const selectedTrips = await tx.trip.findMany({
                where: withTenant(req, {
                    id: { in: tripIds },
                    settlementId: null,
                    vehicle: { vendorAccountId: vendorId }
                })
            });
            if (selectedTrips.length !== tripIds.length) throw new Error('One or more trips are already settled or do not belong to this vendor.');

            const lastSet = await tx.vendorSettlement.findFirst({ where: withTenant(req), orderBy: { id: 'desc' } });
            let nextSeq = 1;
            if (lastSet && lastSet.settlementNo && lastSet.settlementNo.startsWith('VS')) {
                const lastSeq = toInt(lastSet.settlementNo.replace('VS', ''), 0);
                if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
            }
            const settlementNo = `VS${nextSeq.toString().padStart(3, '0')}`;
            const grossAmount = toNumber(d.grossAmount);
            const netPayable = toNumber(d.netPayable);
            const settlementDate = toDate(d.date, new Date());

            const createdSettlement = await tx.vendorSettlement.create({
                data: {
                    settlementNo,
                    tenantKey: req.tenantKey,
                    date: settlementDate,
                    vendorId,
                    totalFreight: toNumber(d.totalFreight),
                    totalHalting: toNumber(d.totalHalting),
                    totalExtraSize: toNumber(d.totalExtraSize),
                    grossAmount,
                    totalAdvances: toNumber(d.totalAdvances),
                    totalCommission: toNumber(d.totalCommission),
                    otherDeductions: toNumber(d.otherDeductions),
                    netPayable,
                    status: netPayable <= 0 ? 'Paid' : 'Unpaid',
                    trips: { connect: tripIds.map(id => ({ id })) }
                }
            });

            const standardAccounts = await ensureStandardAccountingAccounts(tx, req);
            const ledgerEntries = [];
            if (grossAmount > 0) {
                const expenseAccount = standardAccounts['Vendor Freight Expense'];
                ledgerEntries.push(
                    {
                        date: settlementDate,
                        tenantKey: req.tenantKey,
                        accountId: expenseAccount.id,
                        type: 'Dr',
                        amount: grossAmount,
                        narration: `Vendor Freight Expense: ${settlementNo}`,
                        settlementId: createdSettlement.id
                    },
                    {
                        date: settlementDate,
                        tenantKey: req.tenantKey,
                        accountId: vendorId,
                        type: 'Cr',
                        amount: grossAmount,
                        narration: `Vendor Freight Payable: ${settlementNo}`,
                        settlementId: createdSettlement.id
                    }
                );
            }

            const commission = toNumber(d.totalCommission);
            if (commission > 0) {
                ledgerEntries.push(
                    {
                        date: settlementDate,
                        tenantKey: req.tenantKey,
                        accountId: vendorId,
                        type: 'Dr',
                        amount: commission,
                        narration: `Vendor Commission Deducted: ${settlementNo}`,
                        settlementId: createdSettlement.id
                    },
                    {
                        date: settlementDate,
                        tenantKey: req.tenantKey,
                        accountId: standardAccounts['Vendor Commission Income'].id,
                        type: 'Cr',
                        amount: commission,
                        narration: `Vendor Commission Income: ${settlementNo}`,
                        settlementId: createdSettlement.id
                    }
                );
            }

            const dieselByClient = selectedTrips.reduce((sum, trip) => sum + toNumber(trip.dieselAmount), 0);
            if (dieselByClient > 0) {
                const vendorAccount = await tx.account.findFirst({ where: withTenant(req, { id: vendorId }) });
                const vendorDieselAccount = vendorAccount ? await ensureVendorDieselAccount(tx, req, vendorAccount) : null;
                if (!vendorDieselAccount) throw new Error('Vendor diesel account could not be created.');
                ledgerEntries.push(
                    {
                        date: settlementDate,
                        tenantKey: req.tenantKey,
                        accountId: vendorId,
                        type: 'Dr',
                        amount: dieselByClient,
                        narration: `Client-Paid Diesel Deducted: ${settlementNo}`,
                        settlementId: createdSettlement.id
                    },
                    {
                        date: settlementDate,
                        tenantKey: req.tenantKey,
                        accountId: vendorDieselAccount.id,
                        type: 'Cr',
                        amount: dieselByClient,
                        narration: `Vendor Diesel Recoverable Cleared: ${settlementNo}`,
                        settlementId: createdSettlement.id
                    }
                );
            }
            const otherDeductions = toNumber(d.otherDeductions);
            if (otherDeductions > 0) {
                ledgerEntries.push(
                    {
                        date: settlementDate,
                        tenantKey: req.tenantKey,
                        accountId: vendorId,
                        type: 'Dr',
                        amount: otherDeductions,
                        narration: `Vendor Other Deduction: ${settlementNo}`,
                        settlementId: createdSettlement.id
                    },
                    {
                        date: settlementDate,
                        tenantKey: req.tenantKey,
                        accountId: standardAccounts['Vendor Deduction Income'].id,
                        type: 'Cr',
                        amount: otherDeductions,
                        narration: `Vendor Deduction Income: ${settlementNo}`,
                        settlementId: createdSettlement.id
                    }
                );
            }

            if (ledgerEntries.length) await tx.ledgerEntry.createMany({ data: ledgerEntries });

            return createdSettlement;
        });

        res.json(settlement);
    } catch (error) {
        console.error("Settlement Error:", error);
        res.status(400).json({ error: error.message || "Failed to create settlement." });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.$transaction(async (tx) => {
            const settlementId = toRequiredInt(req.params.id, 'Settlement');
            await tx.ledgerEntry.updateMany({ where: withTenant(req, { settlementId }), data: { deletedAt: new Date() } });
            await tx.trip.updateMany({ where: withTenant(req, { settlementId }), data: { settlementId: null } });
            await tx.vendorSettlement.updateMany({ where: withTenant(req, { id: settlementId }), data: { deletedAt: new Date() } });
        });
        res.json({ message: "Settlement deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete settlement." });
    }
});

module.exports = router;


