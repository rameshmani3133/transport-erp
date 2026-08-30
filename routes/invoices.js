const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

// GET ALL INVOICES
router.get('/', async (req, res) => {
    try {
        const invoices = await prisma.invoice.findMany({
            where: withTenant(req),
            include: { location: { include: { company: true } }, trips: true },
            orderBy: { id: 'desc' }
        });
        res.json(invoices);
    } catch (error) {
        console.error("Invoice Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch invoices." });
    }
});

// CREATE INVOICE & POST LEDGER ENTRY
router.post('/', async (req, res) => {
    const d = req.body;
    try {
        const result = await prisma.$transaction(async (tx) => {
            // Generate Invoice No
            const lastInv = await tx.invoice.findFirst({ where: withTenant(req), orderBy: { id: 'desc' } });
            let nextSeq = 1;
            if (lastInv && lastInv.invoiceNo && lastInv.invoiceNo.startsWith('INV')) {
                const lastSeq = parseInt(lastInv.invoiceNo.replace('INV', ''), 10);
                if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
            }
            const invoiceNo = `INV${nextSeq.toString().padStart(4, '0')}`;

            // Create Invoice
            const invoice = await tx.invoice.create({
                data: {
                    invoiceNo,
                    tenantKey: req.tenantKey,
                    date: d.date ? new Date(d.date) : new Date(),
                    dueDate: d.dueDate ? new Date(d.dueDate) : null,
                    locationId: parseInt(d.locationId),
                    subTotal: parseFloat(d.subTotal || 0),
                    cgst: parseFloat(d.cgst || 0),
                    sgst: parseFloat(d.sgst || 0),
                    igst: parseFloat(d.igst || 0),
                    otherCharges: parseFloat(d.otherCharges || 0),
                    grandTotal: parseFloat(d.grandTotal || 0),
                    balanceAmount: parseFloat(d.grandTotal || 0),
                    status: "Unpaid"
                }
            });

            // Update attached Trips
            if (d.tripIds && d.tripIds.length > 0) {
                await tx.trip.updateMany({
                    where: withTenant(req, { id: { in: d.tripIds.map(id => parseInt(id)) } }),
                    data: { invoiceId: invoice.id, status: "Billed" }
                });
            }

            // POST DOUBLE ENTRY TO LEDGER (Debit Client, Credit Income)
            if (d.clientAccountId && d.incomeAccountId && invoice.grandTotal > 0) {
                await tx.ledgerEntry.createMany({
                    data: [
                        {
                            date: invoice.date,
                            tenantKey: req.tenantKey,
                            accountId: parseInt(d.clientAccountId),
                            type: 'Dr', // Debit Client (Increase Asset)
                            amount: invoice.grandTotal,
                            narration: `Billing for Invoice ${invoiceNo}`,
                            invoiceId: invoice.id
                        },
                        {
                            date: invoice.date,
                            tenantKey: req.tenantKey,
                            accountId: parseInt(d.incomeAccountId),
                            type: 'Cr', // Credit Income (Increase Revenue)
                            amount: invoice.grandTotal,
                            narration: `Freight Income for Invoice ${invoiceNo}`,
                            invoiceId: invoice.id
                        }
                    ]
                });
            }

            return invoice;
        });
        res.json(result);
    } catch (error) {
        console.error("Invoice Error:", error);
        res.status(400).json({ error: error.message || "Failed to create invoice." });
    }
});

// DELETE INVOICE
router.delete('/:id', async (req, res) => {
    try {
        await prisma.$transaction(async (tx) => {
            const invId = parseInt(req.params.id);
            
            // Free the trips
            await tx.trip.updateMany({ where: withTenant(req, { invoiceId: invId }), data: { invoiceId: null, status: "Completed" } });
            
            // Delete Ledger math attached to the invoice
            await tx.ledgerEntry.deleteMany({ where: withTenant(req, { invoiceId: invId }) });
            
            // Delete invoice
            await tx.invoice.deleteMany({ where: withTenant(req, { id: invId }) });
        });
        res.json({ message: "Invoice deleted successfully." });
    } catch (error) {
    console.error("Invoice Deletion Error:", error);
        res.status(400).json({ error: "Failed to delete invoice." });
    }
});

module.exports = router;
