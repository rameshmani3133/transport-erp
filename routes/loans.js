const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { toNumber, toInt, toRequiredInt, toRequiredDate, toDate, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

function loanPayload(req, d) {
    const lenderName = text(d.lenderName);
    if (!lenderName) throw new Error('Bank / finance name is required.');
    const nextDueDate = toRequiredDate(d.nextDueDate || d.monthlyDueDate, 'Monthly due date');
    return {
        tenantKey: req.tenantKey,
        loanNo: text(d.loanNo, null) || null,
        lenderName,
        financeAccountId: toInt(d.financeAccountId),
        vehicleId: toInt(d.vehicleId),
        principalAmount: toNumber(d.principalAmount),
        outstandingAmount: toNumber(d.outstandingAmount),
        emiAmount: toNumber(d.emiAmount),
        dueDay: nextDueDate.getDate(),
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
