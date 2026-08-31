const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

function daysUntil(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.ceil((date - today) / 86400000);
}

function statusFor(days) {
    if (days < 0) return 'Overdue';
    if (days <= 7) return 'Due This Week';
    if (days <= 30) return 'Due Soon';
    return 'Upcoming';
}

function addReminder(items, { category, subject, item, dueDate, amount = null, reference = null, owner = null }) {
    if (!dueDate) return;
    const days = daysUntil(dueDate);
    if (!Number.isFinite(days)) return;
    items.push({
        id: `${category}-${subject}-${item}`,
        category,
        subject,
        item,
        dueDate,
        days,
        status: statusFor(days),
        amount,
        reference,
        owner
    });
}

router.get('/', async (req, res) => {
    try {
        const [drivers, vehicles, loans] = await Promise.all([
            prisma.driver.findMany({ where: withTenant(req, { status: 'Active' }) }),
            prisma.vehicle.findMany({ where: withTenant(req, { status: 'Active' }), include: { vendorAccount: true } }),
            prisma.loan.findMany({ where: withTenant(req, { status: 'Active' }), include: { vehicle: true, financeAccount: true } })
        ]);

        const items = [];
        for (const driver of drivers) {
            addReminder(items, { category: 'Driver', subject: driver.name, item: 'License Expiry', dueDate: driver.licenseExpiry, reference: driver.licenseNo, owner: driver.phone });
            addReminder(items, { category: 'Driver', subject: driver.name, item: 'Hazardous/Hazmat Expiry', dueDate: driver.hazmatExpiry, reference: driver.licenseNo, owner: driver.phone });
        }

        for (const vehicle of vehicles) {
            const subject = vehicle.regNo;
            addReminder(items, { category: 'Truck', subject, item: 'FC Expiry', dueDate: vehicle.fcExpiry, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: '1 Year Permit Expiry', dueDate: vehicle.permit1YrExpiry, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: '5 Year Permit Expiry', dueDate: vehicle.permit5YrExpiry, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'PUC Expiry', dueDate: vehicle.pucExpiry, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'Insurance Expiry', dueDate: vehicle.insuranceExpiry, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'CLL Expiry', dueDate: vehicle.cllExpiry, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'PLI Expiry', dueDate: vehicle.pliExpiry, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'Explosive License Expiry', dueDate: vehicle.explosiveExpiry, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'PESO Expiry', dueDate: vehicle.pesoExpiry, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'Safety Valve 1 Expiry', dueDate: vehicle.sv1Expiry, reference: vehicle.sv1Num, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'Safety Valve 2 Expiry', dueDate: vehicle.sv2Expiry, reference: vehicle.sv2Num, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'Safety Valve 3 Expiry', dueDate: vehicle.sv3Expiry, reference: vehicle.sv3Num, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'Internal Valve 1 Expiry', dueDate: vehicle.iv1Expiry, reference: vehicle.iv1Num, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'Internal Valve 2 Expiry', dueDate: vehicle.iv2Expiry, reference: vehicle.iv2Num, owner: vehicle.ownerName });
            addReminder(items, { category: 'Truck', subject, item: 'Internal Valve 3 Expiry', dueDate: vehicle.iv3Expiry, reference: vehicle.iv3Num, owner: vehicle.ownerName });
        }

        for (const loan of loans) {
            addReminder(items, {
                category: 'Loan',
                subject: loan.vehicle?.regNo || loan.lenderName,
                item: 'Loan EMI Due',
                dueDate: loan.nextDueDate,
                amount: loan.emiAmount,
                reference: loan.loanNo || loan.financeAccount?.accountName,
                owner: loan.lenderName
            });
        }

        items.sort((a, b) => a.days - b.days);
        res.json(items);
    } catch (error) {
        console.error('Reminder fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch reminders.' });
    }
});

module.exports = router;
