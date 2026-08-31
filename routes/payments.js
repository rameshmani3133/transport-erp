const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { toNumber, toInt, toDate, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

function voucherLabel(type) {
    return {
        CLIENT_RECEIPT: 'Client Receipt',
        VENDOR_PAYMENT: 'Vendor Payment',
        PUMP_PAYMENT: 'Fuel Pump Payment',
        DRIVER_PAYMENT: 'Driver Payment'
    }[type] || 'Payment Voucher';
}

router.get('/', async (req, res) => {
    try {
        const entries = await prisma.ledgerEntry.findMany({
            where: withTenant(req, { narration: { contains: '[PV-' } }),
            include: { account: true, invoice: true },
            orderBy: { date: 'desc' }
        });
        res.json(entries);
    } catch (error) {
        console.error('Payment Voucher Fetch Error:', error);
        res.status(500).json({ error: 'Failed to fetch payment vouchers.' });
    }
});

router.post('/', async (req, res) => {
    const d = req.body;
    try {
        const result = await prisma.$transaction(async (tx) => {
            const type = d.type;
            const partyAccountId = toInt(d.partyAccountId);
            const cashBankAccountId = toInt(d.cashBankAccountId);
            const amount = toNumber(d.amount);
            const invoiceId = toInt(d.invoiceId);
            if (!Number.isInteger(partyAccountId) || !Number.isInteger(cashBankAccountId) || partyAccountId === cashBankAccountId) {
                throw new Error('Select different party and cash/bank accounts.');
            }
            if (amount <= 0) throw new Error('Amount must be greater than zero.');

            const isReceipt = type === 'CLIENT_RECEIPT';
            const date = toDate(d.date, new Date());
            const voucherNo = `PV-${Date.now()}`;
            const label = voucherLabel(type);
            const narration = `${label}${text(d.referenceNo) ? ` ${text(d.referenceNo)}` : ''} [${voucherNo}]`;

            const entries = [
                {
                    date,
                    tenantKey: req.tenantKey,
                    accountId: isReceipt ? cashBankAccountId : partyAccountId,
                    type: 'Dr',
                    amount,
                    narration,
                    invoiceId: invoiceId || null
                },
                {
                    date,
                    tenantKey: req.tenantKey,
                    accountId: isReceipt ? partyAccountId : cashBankAccountId,
                    type: 'Cr',
                    amount,
                    narration,
                    invoiceId: invoiceId || null
                }
            ];
            await tx.ledgerEntry.createMany({ data: entries });

            let payment = null;
            if (isReceipt && invoiceId) {
                payment = await tx.invoicePayment.create({
                    data: {
                        tenantKey: req.tenantKey,
                        invoiceId,
                        paymentDate: date,
                        amount,
                        paymentMode: text(d.paymentMode, 'Bank') || 'Bank',
                        referenceNo: voucherNo,
                        remarks: [text(d.referenceNo), text(d.remarks)].filter(Boolean).join(' - ') || null
                    }
                });

                const invoice = await tx.invoice.findFirst({ where: withTenant(req, { id: invoiceId }) });
                if (invoice) {
                    const totalPaid = toNumber(invoice.totalPaid) + amount;
                    const balanceAmount = Math.max(toNumber(invoice.grandTotal) - totalPaid, 0);
                    await tx.invoice.update({
                        where: { id: invoice.id },
                        data: {
                            totalPaid,
                            balanceAmount,
                            status: balanceAmount <= 0 ? 'Paid' : 'Unpaid'
                        }
                    });
                }
            }

            return { voucherNo, payment };
        });
        res.json(result);
    } catch (error) {
        console.error('Payment Voucher Error:', error);
        res.status(400).json({ error: error.message || 'Failed to post payment voucher.' });
    }
});

router.delete('/:voucherNo', async (req, res) => {
    try {
        const voucherNo = req.params.voucherNo;
        await prisma.$transaction(async (tx) => {
            const entries = await tx.ledgerEntry.findMany({ where: withTenant(req, { narration: { contains: `[${voucherNo}]` } }) });
            const invoiceIds = [...new Set(entries.map(e => e.invoiceId).filter(Boolean))];
            await tx.ledgerEntry.updateMany({ where: withTenant(req, { narration: { contains: `[${voucherNo}]` } }), data: { deletedAt: new Date() } });
            for (const invoiceId of invoiceIds) {
                await tx.invoicePayment.updateMany({ where: withTenant(req, { invoiceId, referenceNo: voucherNo }), data: { deletedAt: new Date() } });
                const invoice = await tx.invoice.findFirst({ where: withTenant(req, { id: invoiceId }) });
                const payments = await tx.invoicePayment.findMany({ where: withTenant(req, { invoiceId }) });
                const totalPaid = payments.reduce((sum, p) => sum + toNumber(p.amount), toNumber(invoice?.advanceReceived));
                const balanceAmount = Math.max(toNumber(invoice?.grandTotal) - totalPaid, 0);
                await tx.invoice.update({ where: { id: invoiceId }, data: { totalPaid, balanceAmount, status: balanceAmount <= 0 ? 'Paid' : 'Unpaid' } });
            }
        });
        res.json({ message: 'Payment voucher deleted.' });
    } catch (error) {
        console.error('Payment Voucher Delete Error:', error);
        res.status(400).json({ error: 'Failed to delete payment voucher.' });
    }
});

module.exports = router;

