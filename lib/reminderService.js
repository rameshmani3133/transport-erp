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

function addReminder(items, { id, category, subject, item, dueDate, amount = null, reference = null, owner = null }) {
  if (!dueDate) return;
  const days = daysUntil(dueDate);
  if (!Number.isFinite(days)) return;
  items.push({
    id: id || `${category}-${subject}-${item}`,
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

async function buildReminderItems(prisma, tenantKey) {
  const where = { tenantKey, deletedAt: null, status: 'Active' };
  const [drivers, vehicles, loans, recurringBills] = await Promise.all([
    prisma.driver.findMany({ where }),
    prisma.vehicle.findMany({ where, include: { vendorAccount: true } }),
    prisma.loan.findMany({ where, include: { vehicle: true, financeAccount: true } }),
    prisma.recurringBill.findMany({
      where: { ...where, reminderEnabled: true },
      orderBy: { nextDueDate: 'asc' }
    })
  ]);

  const items = [];
  for (const driver of drivers) {
    addReminder(items, { id: `Driver-${driver.id}-license`, category: 'Driver', subject: driver.name, item: 'License Expiry', dueDate: driver.licenseExpiry, reference: driver.licenseNo, owner: driver.phone });
    addReminder(items, { id: `Driver-${driver.id}-hazmat`, category: 'Driver', subject: driver.name, item: 'Hazardous/Hazmat Expiry', dueDate: driver.hazmatExpiry, reference: driver.licenseNo, owner: driver.phone });
  }

  for (const vehicle of vehicles) {
    const subject = vehicle.regNo;
    addReminder(items, { id: `Truck-${vehicle.id}-fc`, category: 'Truck', subject, item: 'FC Expiry', dueDate: vehicle.fcExpiry, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-permit-1yr`, category: 'Truck', subject, item: '1 Year Permit Expiry', dueDate: vehicle.permit1YrExpiry, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-permit-5yr`, category: 'Truck', subject, item: '5 Year Permit Expiry', dueDate: vehicle.permit5YrExpiry, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-puc`, category: 'Truck', subject, item: 'PUC Expiry', dueDate: vehicle.pucExpiry, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-insurance`, category: 'Truck', subject, item: 'Insurance Expiry', dueDate: vehicle.insuranceExpiry, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-cll`, category: 'Truck', subject, item: 'CLL Expiry', dueDate: vehicle.cllExpiry, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-pli`, category: 'Truck', subject, item: 'PLI Expiry', dueDate: vehicle.pliExpiry, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-explosive`, category: 'Truck', subject, item: 'Explosive License Expiry', dueDate: vehicle.explosiveExpiry, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-peso`, category: 'Truck', subject, item: 'PESO Expiry', dueDate: vehicle.pesoExpiry, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-sv1`, category: 'Truck', subject, item: 'Safety Valve 1 Expiry', dueDate: vehicle.sv1Expiry, reference: vehicle.sv1Num, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-sv2`, category: 'Truck', subject, item: 'Safety Valve 2 Expiry', dueDate: vehicle.sv2Expiry, reference: vehicle.sv2Num, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-sv3`, category: 'Truck', subject, item: 'Safety Valve 3 Expiry', dueDate: vehicle.sv3Expiry, reference: vehicle.sv3Num, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-iv1`, category: 'Truck', subject, item: 'Internal Valve 1 Expiry', dueDate: vehicle.iv1Expiry, reference: vehicle.iv1Num, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-iv2`, category: 'Truck', subject, item: 'Internal Valve 2 Expiry', dueDate: vehicle.iv2Expiry, reference: vehicle.iv2Num, owner: vehicle.ownerName });
    addReminder(items, { id: `Truck-${vehicle.id}-iv3`, category: 'Truck', subject, item: 'Internal Valve 3 Expiry', dueDate: vehicle.iv3Expiry, reference: vehicle.iv3Num, owner: vehicle.ownerName });
  }

  for (const loan of loans) {
    addReminder(items, {
      id: `Loan-${loan.id}-emi`,
      category: 'Loan',
      subject: loan.vehicle?.regNo || loan.lenderName,
      item: 'Monthly Loan EMI Due',
      dueDate: loan.nextDueDate,
      amount: loan.emiAmount,
      reference: loan.loanNo || loan.financeAccount?.accountName,
      owner: loan.lenderName
    });
  }

  for (const bill of recurringBills) {
    addReminder(items, {
      id: `RecurringBill-${bill.id}-monthly`,
      category: 'Monthly Bill',
      subject: bill.billName,
      item: `${bill.category} payment due`,
      dueDate: bill.nextDueDate,
      amount: bill.amount,
      reference: bill.consumerNumber,
      owner: bill.providerName
    });
  }

  return items.sort((a, b) => a.days - b.days);
}

function actionableReminders(items, daysAhead = 30) {
  return items.filter(item => item.days <= daysAhead);
}

function parseTriggerDays(value) {
  const source = value == null || value === '' ? '30,15,7,3,2,1' : value;
  return [...new Set(String(source)
    .split(',')
    .map(item => Number(String(item).trim()))
    .filter(item => Number.isInteger(item) && item >= 0))]
    .sort((a, b) => b - a);
}

function frequencyReminders(items, triggerDays = parseTriggerDays()) {
  const allowed = new Set(Array.isArray(triggerDays) ? triggerDays : parseTriggerDays(triggerDays));
  return items.filter(item => allowed.has(item.days));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dateText(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-IN');
}

function money(value) {
  return value == null ? '-' : `Rs.${Number(value || 0).toFixed(2)}`;
}

function reminderEmailHtml(items, tenantKey) {
  const rows = items.map(item => `
    <tr>
      <td>${escapeHtml(item.category)}</td>
      <td><strong>${escapeHtml(item.subject)}</strong></td>
      <td>${escapeHtml(item.item)}</td>
      <td>${escapeHtml(dateText(item.dueDate))}</td>
      <td>${escapeHtml(item.days < 0 ? `${Math.abs(item.days)} overdue` : `${item.days} left`)}</td>
      <td>${escapeHtml(money(item.amount))}</td>
      <td>${escapeHtml(item.reference || '-')}</td>
      <td>${escapeHtml(item.owner || '-')}</td>
      <td>${escapeHtml(item.status)}</td>
    </tr>
  `).join('');

  return `
    <html>
      <body style="font-family:Arial,sans-serif;color:#0f172a">
        <h2 style="margin:0 0 6px">Transport ERP Reminders</h2>
        <p style="margin:0 0 16px;color:#475569">Company: ${escapeHtml(tenantKey)} | Items: ${items.length}</p>
        <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
          <thead>
            <tr style="background:#f1f5f9">
              <th align="left">Category</th>
              <th align="left">Subject</th>
              <th align="left">Reminder</th>
              <th align="left">Due Date</th>
              <th align="left">Days</th>
              <th align="left">Amount</th>
              <th align="left">Reference</th>
              <th align="left">Owner / Lender</th>
              <th align="left">Status</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="9">No reminders due.</td></tr>'}</tbody>
        </table>
      </body>
    </html>
  `;
}

function parseRecipients(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list
    .map(email => String(email || '').trim().toLowerCase())
    .filter(Boolean)
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .filter((email, index, list) => list.indexOf(email) === index);
}

async function defaultReminderRecipients(prisma, tenantKey) {
  const profile = await prisma.myCompanyProfile.findFirst({
    where: { tenantKey, deletedAt: null },
    select: { reminderEmails: true }
  });
  return parseRecipients(profile?.reminderEmails);
}

async function sendReminderEmail({ recipients, items, tenantKey }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.REMINDER_FROM_EMAIL;
  const senderName = process.env.REMINDER_FROM_NAME || 'Transport ERP';

  if (!apiKey) throw new Error('BREVO_API_KEY is not configured.');
  if (!senderEmail) throw new Error('REMINDER_FROM_EMAIL is not configured.');
  if (!recipients.length) throw new Error('No reminder recipient email configured.');

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: recipients.map(email => ({ email })),
      subject: `Transport ERP reminders - ${tenantKey}`,
      htmlContent: reminderEmailHtml(items, tenantKey)
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Brevo email failed with HTTP ${response.status}`);
  }
  return body;
}

function scheduleDailyReminderEmails(prisma) {
  if (process.env.REMINDER_EMAIL_ENABLED !== 'true') return;

  const configuredTenant = process.env.REMINDER_TENANT;
  const globalRecipients = parseRecipients(process.env.REMINDER_TO_EMAIL);
  const triggerDays = parseTriggerDays(process.env.REMINDER_TRIGGER_DAYS);
  const time = process.env.REMINDER_DAILY_TIME || '08:00';
  const [hour = 8, minute = 0] = time.split(':').map(value => Number(value));

  const scheduleNext = () => {
    const next = new Date();
    next.setHours(Number.isFinite(hour) ? hour : 8, Number.isFinite(minute) ? minute : 0, 0, 0);
    if (next <= new Date()) next.setDate(next.getDate() + 1);

    setTimeout(async () => {
      try {
        const profiles = configuredTenant
          ? [{ tenantKey: configuredTenant }]
          : await prisma.myCompanyProfile.findMany({
              where: { deletedAt: null },
              select: { tenantKey: true, reminderEmails: true },
              orderBy: { tenantKey: 'asc' }
            });

        for (const profile of profiles) {
          const tenantKey = profile.tenantKey;
          const recipients = parseRecipients(profile.reminderEmails).length
            ? parseRecipients(profile.reminderEmails)
            : configuredTenant
                ? await defaultReminderRecipients(prisma, tenantKey)
                : globalRecipients;
          const items = frequencyReminders(await buildReminderItems(prisma, tenantKey), triggerDays);
          if (items.length && recipients.length) {
            await sendReminderEmail({ recipients, items, tenantKey });
            console.log(`Reminder email sent for ${tenantKey} to ${recipients.join(', ')} with ${items.length} item(s).`);
          }
        }
      } catch (error) {
        console.error('Scheduled reminder email failed:', error.message);
      } finally {
        scheduleNext();
      }
    }, next - new Date());
  };

  scheduleNext();
}

module.exports = {
  actionableReminders,
  buildReminderItems,
  defaultReminderRecipients,
  frequencyReminders,
  parseRecipients,
  parseTriggerDays,
  sendReminderEmail,
  scheduleDailyReminderEmails
};
