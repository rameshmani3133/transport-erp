const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureStandardAccountingAccounts, ensureClientDieselAccount } = require('../lib/accountingAccounts');
const { toNumber, toInt, toRequiredInt, toDate, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

function incrementInvoiceNo(invoiceNo) {
    const value = String(invoiceNo || '').trim();
    if (!value) return '';
    const noMatch = value.match(/^(.*?\bNO[\s-]*)(\d+)(.*)$/i);
    const match = noMatch || value.match(/^(.*?)(\d+)(\D*)$/);
    if (!match) return `${value}-1`;
    const next = String(parseInt(match[2], 10) + 1).padStart(match[2].length, '0');
    return `${match[1]}${next}${match[3]}`;
}

async function resolveInvoiceNo(tx, req, d, companyId, currentInvoiceId = null) {
    const manualInvoiceNo = String(d.invoiceNo || '').trim();
    if (manualInvoiceNo) {
        const duplicate = await tx.invoice.findFirst({
            where: withTenant(req, {
                invoiceNo: manualInvoiceNo,
                ...(currentInvoiceId ? { NOT: { id: currentInvoiceId } } : {})
            })
        });
        if (duplicate) throw new Error('Invoice number already exists.');
        return manualInvoiceNo;
    }

    const previous = await tx.invoice.findFirst({
        where: withTenant(req, {
            location: { companyId },
            ...(currentInvoiceId ? { NOT: { id: currentInvoiceId } } : {})
        }),
        orderBy: { id: 'desc' }
    });
    if (!previous) throw new Error('Enter the first invoice number manually for this client.');
    let nextInvoiceNo = incrementInvoiceNo(previous.invoiceNo);
    for (let i = 0; i < 50; i += 1) {
        const duplicate = await tx.invoice.findFirst({
            where: withTenant(req, {
                invoiceNo: nextInvoiceNo,
                ...(currentInvoiceId ? { NOT: { id: currentInvoiceId } } : {})
            })
        });
        if (!duplicate) return nextInvoiceNo;
        nextInvoiceNo = incrementInvoiceNo(nextInvoiceNo);
    }
    throw new Error('Could not generate a unique invoice number. Please enter it manually.');
}

async function buildInvoiceLedgerEntries(tx, req, invoice, selectedTrips, d, invoiceNo) {
    if (!d.clientAccountId || !d.incomeAccountId) throw new Error('Client and revenue accounts are required.');
    const standardAccounts = await ensureStandardAccountingAccounts(tx, req);
    const subTotal = toNumber(invoice.subTotal);
    const cgst = toNumber(invoice.cgst);
    const sgst = toNumber(invoice.sgst);
    const igst = toNumber(invoice.igst);
    const otherCharges = toNumber(invoice.otherCharges);
    const grandTotal = toNumber(invoice.grandTotal);
    const ledgerEntries = [
        {
            date: invoice.date,
            tenantKey: req.tenantKey,
            accountId: toRequiredInt(d.clientAccountId, 'Client account'),
            type: 'Dr',
            amount: grandTotal,
            narration: `Billing for Invoice ${invoiceNo}`,
            invoiceId: invoice.id
        },
        {
            date: invoice.date,
            tenantKey: req.tenantKey,
            accountId: toRequiredInt(d.incomeAccountId, 'Income account'),
            type: 'Cr',
            amount: subTotal + otherCharges,
            narration: `Freight Income for Invoice ${invoiceNo}`,
            invoiceId: invoice.id
        }
    ];

    if (cgst > 0) ledgerEntries.push({ date: invoice.date, tenantKey: req.tenantKey, accountId: standardAccounts['Output CGST'].id, type: 'Cr', amount: cgst, narration: `Output CGST for Invoice ${invoiceNo}`, invoiceId: invoice.id });
    if (sgst > 0) ledgerEntries.push({ date: invoice.date, tenantKey: req.tenantKey, accountId: standardAccounts['Output SGST'].id, type: 'Cr', amount: sgst, narration: `Output SGST for Invoice ${invoiceNo}`, invoiceId: invoice.id });
    if (igst > 0) ledgerEntries.push({ date: invoice.date, tenantKey: req.tenantKey, accountId: standardAccounts['Output IGST'].id, type: 'Cr', amount: igst, narration: `Output IGST for Invoice ${invoiceNo}`, invoiceId: invoice.id });

    const dieselByClient = selectedTrips.reduce((sum, trip) => sum + toNumber(trip.dieselAmount), 0);
    if (dieselByClient > 0 && selectedTrips[0]) {
        const company = await tx.clientCompany.findFirst({ where: withTenant(req, { id: selectedTrips[0].companyId }) });
        const clientDieselAccount = company ? await ensureClientDieselAccount(tx, req, company) : null;
        if (!clientDieselAccount) throw new Error('Client diesel account could not be created.');
        ledgerEntries.push(
            { date: invoice.date, tenantKey: req.tenantKey, accountId: clientDieselAccount.id, type: 'Dr', amount: dieselByClient, narration: `Client Diesel Cleared Against Invoice ${invoiceNo}`, invoiceId: invoice.id },
            { date: invoice.date, tenantKey: req.tenantKey, accountId: toRequiredInt(d.clientAccountId, 'Client account'), type: 'Cr', amount: dieselByClient, narration: `Client Diesel Payment Adjusted: ${invoiceNo}`, invoiceId: invoice.id }
        );
    }

    if (ledgerEntries.length) await tx.ledgerEntry.createMany({ data: ledgerEntries });
}

function invoiceTotals(selectedTrips, d) {
    const subTotal = selectedTrips.reduce((sum, trip) => sum + toNumber(trip.totalClientBill), 0);
    const cgst = toNumber(d.cgst);
    const sgst = toNumber(d.sgst);
    const igst = toNumber(d.igst);
    const otherCharges = toNumber(d.otherCharges);
    const grandTotal = subTotal + cgst + sgst + igst + otherCharges;
    const advanceReceived = selectedTrips.reduce((sum, trip) => sum + toNumber(trip.clientAdvanceAmount), 0);
    return { subTotal, cgst, sgst, igst, otherCharges, grandTotal, advanceReceived };
}

router.get('/', async (req, res) => {
    try {
        const invoices = await prisma.invoice.findMany({
            where: withTenant(req),
            include: { location: { include: { company: true } }, trips: { include: { vehicle: true, route: true } }, payments: true },
            orderBy: { id: 'desc' }
        });
        res.json(invoices);
    } catch (error) {
        console.error("Invoice Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch invoices." });
    }
});

router.post('/', async (req, res) => {
    const d = req.body;
    try {
        const result = await prisma.$transaction(async (tx) => {
            const tripIds = (d.tripIds || []).map(id => toInt(id)).filter(id => Number.isInteger(id));
            const selectedTrips = tripIds.length ? await tx.trip.findMany({
                where: withTenant(req, { id: { in: tripIds }, invoiceId: null })
            }) : [];
            if (selectedTrips.length !== tripIds.length) throw new Error('One or more selected trips are no longer available for billing.');
            if (!selectedTrips.length) throw new Error('Please select at least one trip to bill.');

            const locationId = toRequiredInt(d.locationId, 'Billing location');
            const location = await tx.billingLocation.findFirst({ where: withTenant(req, { id: locationId }) });
            if (!location) throw new Error('Billing location not found.');
            if (selectedTrips.some(trip => trip.companyId !== location.companyId)) throw new Error('All selected trips must belong to the selected billing location client.');
            const invoiceNo = await resolveInvoiceNo(tx, req, d, location.companyId);

            const { subTotal, cgst, sgst, igst, otherCharges, grandTotal, advanceReceived } = invoiceTotals(selectedTrips, d);
            const balanceAmount = Math.max(grandTotal - advanceReceived, 0);

            const invoice = await tx.invoice.create({
                data: {
                    invoiceNo,
                    tenantKey: req.tenantKey,
                    description: text(d.description, null) || null,
                    sacCode: text(d.sacCode, null) || null,
                    showStatus: Boolean(d.showStatus),
                    date: toDate(d.date, new Date()),
                    dueDate: toDate(d.dueDate),
                    locationId,
                    subTotal,
                    cgst,
                    sgst,
                    igst,
                    otherCharges,
                    grandTotal,
                    advanceReceived,
                    totalPaid: advanceReceived,
                    balanceAmount,
                    status: balanceAmount <= 0 ? "Paid" : "Unpaid"
                }
            });

            if (tripIds.length > 0) {
                await tx.trip.updateMany({
                    where: withTenant(req, { id: { in: tripIds } }),
                    data: { invoiceId: invoice.id, status: "Billed" }
                });
            }

            await buildInvoiceLedgerEntries(tx, req, invoice, selectedTrips, d, invoiceNo);
            return invoice;
        });
        res.json(result);
    } catch (error) {
        console.error("Invoice Error:", error);
        res.status(400).json({ error: error.message || "Failed to create invoice." });
    }
});

router.put('/:id', async (req, res) => {
    const d = req.body;
    try {
        const result = await prisma.$transaction(async (tx) => {
            const invId = toRequiredInt(req.params.id, 'Invoice');
            const existing = await tx.invoice.findFirst({
                where: withTenant(req, { id: invId }),
                include: { payments: true, trips: true }
            });
            if (!existing) throw new Error('Invoice not found.');

            const tripIds = (d.tripIds || []).map(id => toInt(id)).filter(id => Number.isInteger(id));
            if (!tripIds.length) throw new Error('Please select at least one trip to bill.');

            const selectedTrips = await tx.trip.findMany({
                where: withTenant(req, {
                    id: { in: tripIds },
                    OR: [{ invoiceId: null }, { invoiceId: invId }]
                })
            });
            if (selectedTrips.length !== tripIds.length) throw new Error('One or more selected trips are already billed in another invoice.');

            const locationId = toRequiredInt(d.locationId, 'Billing location');
            const location = await tx.billingLocation.findFirst({ where: withTenant(req, { id: locationId }) });
            if (!location) throw new Error('Billing location not found.');
            if (selectedTrips.some(trip => trip.companyId !== location.companyId)) throw new Error('All selected trips must belong to the selected billing location client.');
            const invoiceNo = await resolveInvoiceNo(tx, req, d, location.companyId, invId);

            const selectedSet = new Set(tripIds);
            const removedTripIds = existing.trips.map(t => t.id).filter(id => !selectedSet.has(id));
            if (removedTripIds.length) {
                await tx.trip.updateMany({
                    where: withTenant(req, { id: { in: removedTripIds }, invoiceId: invId }),
                    data: { invoiceId: null, status: 'Completed' }
                });
            }

            await tx.trip.updateMany({
                where: withTenant(req, { id: { in: tripIds } }),
                data: { invoiceId: invId, status: 'Billed' }
            });

            const { subTotal, cgst, sgst, igst, otherCharges, grandTotal, advanceReceived } = invoiceTotals(selectedTrips, d);
            const paymentTotal = existing.payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
            const totalPaid = advanceReceived + paymentTotal;
            const balanceAmount = Math.max(grandTotal - totalPaid, 0);

            const invoice = await tx.invoice.update({
                where: { id: invId },
                data: {
                    invoiceNo,
                    description: text(d.description, null) || null,
                    sacCode: text(d.sacCode, null) || null,
                    showStatus: Boolean(d.showStatus),
                    date: toDate(d.date, existing.date),
                    dueDate: toDate(d.dueDate),
                    locationId,
                    subTotal,
                    cgst,
                    sgst,
                    igst,
                    otherCharges,
                    grandTotal,
                    advanceReceived,
                    totalPaid,
                    balanceAmount,
                    status: balanceAmount <= 0 ? 'Paid' : 'Unpaid'
                }
            });

            await tx.ledgerEntry.updateMany({
                where: withTenant(req, { invoiceId: invId, NOT: { narration: { contains: '[PV-' } } }),
                data: { deletedAt: new Date() }
            });
            await buildInvoiceLedgerEntries(tx, req, invoice, selectedTrips, d, invoice.invoiceNo);
            return invoice;
        });
        res.json(result);
    } catch (error) {
        console.error("Invoice Update Error:", error);
        res.status(400).json({ error: error.message || "Failed to update invoice." });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.$transaction(async (tx) => {
            const invId = toRequiredInt(req.params.id, 'Invoice');
            await tx.trip.updateMany({ where: withTenant(req, { invoiceId: invId }), data: { invoiceId: null, status: "Completed" } });
            await tx.ledgerEntry.updateMany({ where: withTenant(req, { invoiceId: invId }), data: { deletedAt: new Date() } });
            await tx.invoicePayment.updateMany({ where: withTenant(req, { invoiceId: invId }), data: { deletedAt: new Date() } });
            await tx.invoice.updateMany({ where: withTenant(req, { id: invId }), data: { deletedAt: new Date() } });
        });
        res.json({ message: "Invoice deleted successfully." });
    } catch (error) {
        console.error("Invoice Deletion Error:", error);
        res.status(400).json({ error: "Failed to delete invoice." });
    }
});

module.exports = router;

