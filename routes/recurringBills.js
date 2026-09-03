const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { toNumber, toRequiredInt, toRequiredDate, toDate, text } = require('../lib/coerce');

const router = express.Router();
const prisma = new PrismaClient();
const PAYMENT_STATUSES = ['Due', 'Paid', 'Overdue'];
const ACTIVE_STATUSES = ['Active', 'On Hold', 'Closed'];

function dateParts(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Due date is invalid.');
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function monthlyDate(year, month, dueDay) {
  const day = Math.max(1, Math.min(31, Number(dueDay)));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function nextMonthlyDate(value, dueDay) {
  const source = dateParts(value);
  return monthlyDate(source.year, source.month + 1, dueDay || source.day);
}

function billPayload(req, body) {
  const billName = text(body.billName);
  if (!billName) throw new Error('Bill / payment name is required.');
  const amount = toNumber(body.amount);
  if (!(amount > 0)) throw new Error('Monthly amount must be greater than zero.');
  const nextDueDate = toRequiredDate(body.nextDueDate, 'Next due date');
  const dueDay = dateParts(body.nextDueDate).day;
  return {
    tenantKey: req.tenantKey,
    category: text(body.category) || 'Other',
    billName,
    providerName: text(body.providerName, null) || null,
    consumerNumber: text(body.consumerNumber, null) || null,
    amount,
    dueDay,
    nextDueDate,
    paymentStatus: PAYMENT_STATUSES.includes(body.paymentStatus) ? body.paymentStatus : 'Due',
    lastPaidDate: toDate(body.lastPaidDate),
    reminderEnabled: body.reminderEnabled !== false,
    startDate: toDate(body.startDate),
    endDate: toDate(body.endDate),
    status: ACTIVE_STATUSES.includes(body.status) ? body.status : 'Active',
    remarks: text(body.remarks, null) || null
  };
}

const includePayments = {
  payments: {
    where: { deletedAt: null },
    orderBy: [{ paidDate: 'desc' }, { id: 'desc' }],
    take: 24
  }
};

router.get('/', async (req, res) => {
  try {
    const bills = await prisma.recurringBill.findMany({
      where: withTenant(req),
      include: includePayments,
      orderBy: [{ nextDueDate: 'asc' }, { billName: 'asc' }]
    });
    res.json(bills);
  } catch (error) {
    console.error('Recurring bill fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch recurring bills.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const bill = await prisma.recurringBill.create({
      data: billPayload(req, req.body),
      include: includePayments
    });
    res.json(bill);
  } catch (error) {
    console.error('Recurring bill create error:', error);
    res.status(400).json({ error: error.message || 'Failed to create recurring bill.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'Recurring bill');
    const result = await prisma.recurringBill.updateMany({
      where: withTenant(req, { id }),
      data: billPayload(req, req.body)
    });
    if (!result.count) return res.status(404).json({ error: 'Recurring bill not found.' });
    const bill = await prisma.recurringBill.findFirst({ where: withTenant(req, { id }), include: includePayments });
    res.json(bill);
  } catch (error) {
    console.error('Recurring bill update error:', error);
    res.status(400).json({ error: error.message || 'Failed to update recurring bill.' });
  }
});

router.post('/:id/payments', async (req, res) => {
  res.status(409).json({ error: 'Post monthly bill payments through Voucher Center so expense, tax, bank, payment history, and due dates stay synchronized.' });
});

router.delete('/:id', async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, 'Recurring bill');
    const result = await prisma.recurringBill.updateMany({
      where: withTenant(req, { id }),
      data: { deletedAt: new Date() }
    });
    if (!result.count) return res.status(404).json({ error: 'Recurring bill not found.' });
    await prisma.recurringBillPayment.updateMany({
      where: { tenantKey: req.tenantKey, recurringBillId: id, deletedAt: null },
      data: { deletedAt: new Date() }
    });
    res.json({ message: 'Recurring bill moved to recycle bin.' });
  } catch (error) {
    console.error('Recurring bill delete error:', error);
    res.status(400).json({ error: 'Failed to delete recurring bill.' });
  }
});

module.exports = router;
