const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { buildReminderItems, defaultReminderRecipients, parseRecipients, sendReminderEmail } = require('../lib/reminderService');
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
        const companyRecipients = await defaultReminderRecipients(prisma, req.tenantKey);
        const userRecipients = parseRecipients(req.user?.reminderEmails);
        const fallbackRecipients = companyRecipients.length
            ? companyRecipients
            : userRecipients.length
                ? userRecipients
                : process.env.REMINDER_TO_EMAIL || req.user?.email || '';
        const recipients = parseRecipients(req.body.recipients || fallbackRecipients);
        const allItems = await buildReminderItems(prisma, req.tenantKey);
        if (!Array.isArray(req.body.itemIds)) {
            return res.status(400).json({ error: 'Filtered reminder IDs are required. Refresh the page and try again.' });
        }
        const requestedIds = [...new Set(req.body.itemIds.map(id => String(id || '').trim()).filter(Boolean))];
        if (!requestedIds.length) return res.status(400).json({ error: 'No filtered reminders selected.' });
        if (requestedIds.length > 1000) return res.status(400).json({ error: 'Too many reminders selected.' });
        const allowedIds = new Set(requestedIds);
        const items = allItems.filter(item => allowedIds.has(item.id));
        if (items.length !== requestedIds.length) {
            return res.status(409).json({ error: 'The filtered reminder list changed. Refresh the page and try again.' });
        }
        const result = await sendReminderEmail({ recipients, items, tenantKey: req.tenantKey });

        res.json({ message: `Reminder email sent to ${recipients.join(', ')}.`, sent: recipients.length, items: items.length, provider: result });
    } catch (error) {
        console.error('Reminder email error:', error);
        res.status(400).json({ error: error.message || 'Failed to send reminder email.' });
    }
});

module.exports = router;
