const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { actionableReminders, buildReminderItems, defaultReminderRecipients, parseRecipients, sendReminderEmail } = require('../lib/reminderService');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
    try {
        res.json(await buildReminderItems(prisma, req.tenantKey));
    } catch (error) {
        console.error('Reminder fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch reminders.' });
    }
});

router.post('/email', async (req, res) => {
    try {
        const daysAhead = Number(req.body.daysAhead || process.env.REMINDER_DAYS_AHEAD || 30);
        const companyRecipients = await defaultReminderRecipients(prisma, req.tenantKey);
        const userRecipients = parseRecipients(req.user?.reminderEmails);
        const fallbackRecipients = companyRecipients.length
            ? companyRecipients
            : userRecipients.length
                ? userRecipients
                : process.env.REMINDER_TO_EMAIL || req.user?.email || '';
        const recipients = parseRecipients(req.body.recipients || fallbackRecipients);
        const items = actionableReminders(await buildReminderItems(prisma, req.tenantKey), Number.isFinite(daysAhead) ? daysAhead : 30);
        const result = await sendReminderEmail({ recipients, items, tenantKey: req.tenantKey });

        res.json({ message: `Reminder email sent to ${recipients.join(', ')}.`, sent: recipients.length, items: items.length, provider: result });
    } catch (error) {
        console.error('Reminder email error:', error);
        res.status(400).json({ error: error.message || 'Failed to send reminder email.' });
    }
});

module.exports = router;
