const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { toNumber, toInt, toRequiredInt, toRequiredDate, toDate, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();
const PAYMENT_STATUSES = ['Due', 'Paid', 'Part Paid', 'Overdue', 'Skipped'];

function dateParts(dateValue) {
    if (typeof dateValue === 'string') {
        const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
    }
    const source = new Date(dateValue);
    if (Number.isNaN(source.getTime())) throw new Error('Current due date is invalid.');
    return { year: source.getFullYear(), month: source.getMonth(), day: source.getDate() };
}

function clampedMonthlyDate(year, month, day) {
    const targetDay = Math.max(1, Math.min(31, Number(day)));
    const lastDay = new Date(year, month + 1, 0).getDate();
    const target = new Date(year, month, Math.min(targetDay, lastDay));
    target.setHours(0, 0, 0, 0);
    return target;
}

function addOneMonth(dateValue, dueDay) {
    const source = dateParts(dateValue);
    return clampedMonthlyDate(source.year, source.month + 1, dueDay || source.day);
}

function loanPayload(req, d) {
    const lenderName = text(d.lenderName);
    if (!lenderName) throw new Error('Bank / finance name is required.');
    const nextDueDate = toRequiredDate(d.nextDueDate || d.monthlyDueDate, 'Monthly due date');
    const nextDueDateParts = dateParts(d.nextDueDate || d.monthlyDueDate || nextDueDate);
    return {
        tenantKey: req.tenantKey,
        loanNo: text(d.loanNo, null) || null,
        lenderName,
        lenderBankName: text(d.lenderBankName, null) || null,
        lenderAccountNo: text(d.lenderAccountNo, null) || null,
        lenderIfscCode: text(d.lenderIfscCode, null) || null,
        lenderBranch: text(d.lenderBranch, null) || null,
        paymentStatus: PAYMENT_STATUSES.includes(d.paymentStatus) ? d.paymentStatus : 'Due',
        paidDate: toDate(d.paidDate),
        financeAccountId: toInt(d.financeAccountId),
        vehicleId: toInt(d.vehicleId),
        principalAmount: toNumber(d.principalAmount),
        outstandingAmount: toNumber(d.outstandingAmount),
        emiAmount: toNumber(d.emiAmount),
        dueDay: nextDueDateParts.day,
        nextDueDate,
        startDate: toDate(d.startDate),
        endDate: toDate(d.endDate),
        status: d.status || 'Active',
        remarks: text(d.remarks, null) || null
    };
}

router.get('/', async (req, res) => {
    try {
        const loans = await prisma.loan.findMany({
            where: withTenant(req),
            include: { financeAccount: true, vehicle: true },
            orderBy: { nextDueDate: 'asc' }
        });
        res.json(loans);
    } catch (error) {
        console.error('Loan fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch loans.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const loan = await prisma.loan.create({ data: loanPayload(req, req.body) });
        res.json(loan);
    } catch (error) {
        console.error('Loan create error:', error);
        if (error.code === 'P2002') return res.status(400).json({ error: 'Loan number already exists.' });
        res.status(400).json({ error: error.message || 'Failed to create loan.' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const loan = await prisma.loan.update({
            where: withTenant(req, { id: toRequiredInt(req.params.id, 'Loan') }),
            data: loanPayload(req, req.body)
        });
        res.json(loan);
    } catch (error) {
        console.error('Loan update error:', error);
        if (error.code === 'P2002') return res.status(400).json({ error: 'Loan number already exists.' });
        res.status(400).json({ error: error.message || 'Failed to update loan.' });
    }
});

router.patch('/:id/payment-status', async (req, res) => {
    try {
        const paymentStatus = PAYMENT_STATUSES.includes(req.body.paymentStatus)
            ? req.body.paymentStatus
            : null;
        if (!paymentStatus) return res.status(400).json({ error: 'Valid payment status is required.' });
        const id = toRequiredInt(req.params.id, 'Loan');
        const existing = await prisma.loan.findFirst({ where: withTenant(req, { id }) });
        if (!existing) return res.status(404).json({ error: 'Loan not found.' });

        const data = { paymentStatus };
        if (paymentStatus === 'Paid') {
            const paidDate = toRequiredDate(req.body.paidDate, 'Paid date');
            const nextDueDate = addOneMonth(existing.nextDueDate, existing.dueDay);
            const outstandingAmount = Math.max(0, toNumber(existing.outstandingAmount) - toNumber(existing.emiAmount));
            data.paidDate = paidDate;
            data.nextDueDate = nextDueDate;
            data.dueDay = existing.dueDay || nextDueDate.getDate();
            data.outstandingAmount = outstandingAmount;
            data.paymentStatus = outstandingAmount <= 0 ? 'Paid' : 'Due';
            if (outstandingAmount <= 0) data.status = 'Closed';
        } else if (paymentStatus !== 'Part Paid') {
            data.paidDate = null;
        }

        const result = await prisma.loan.updateMany({
            where: withTenant(req, { id }),
            data
        });
        if (!result.count) return res.status(404).json({ error: 'Loan not found.' });

        const loan = await prisma.loan.findFirst({
            where: withTenant(req, { id }),
            include: { financeAccount: true, vehicle: true }
        });
        res.json(loan);
    } catch (error) {
        console.error('Loan payment status update error:', error);
        res.status(400).json({ error: error.message || 'Failed to update payment status.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.loan.updateMany({
            where: withTenant(req, { id: toRequiredInt(req.params.id, 'Loan') }),
            data: { deletedAt: new Date() }
        });
        res.json({ message: 'Loan deleted.' });
    } catch (error) {
        console.error('Loan delete error:', error);
        res.status(400).json({ error: 'Failed to delete loan.' });
    }
});

module.exports = router;
