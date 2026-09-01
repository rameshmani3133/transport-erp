import React, { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';

const money = (value) => value == null ? '-' : `Rs.${Number(value || 0).toFixed(2)}`;
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-';
const triggerDays = [30, 15, 7, 3, 2, 1];

function normalizeEmails(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map(item => String(item || '').trim().toLowerCase()).filter(item => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))];
}

function tone(status) {
  if (status === 'Overdue') return ['#fee2e2', '#dc2626'];
  if (status === 'Due This Week') return ['#ffedd5', '#ea580c'];
  if (status === 'Due Soon') return ['#fef3c7', '#b45309'];
  return ['#dcfce7', '#15803d'];
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
      <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
      <strong style={{ color, fontSize: '26px' }}>{value}</strong>
    </div>
  );
}

export default function Reminders() {
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('Actionable');
  const [loading, setLoading] = useState(true);
  const [companyEmails, setCompanyEmails] = useState([]);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [newReminderEmail, setNewReminderEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const loadReminders = async () => {
    setLoading(true);
    const [reminderRes, profileRes] = await Promise.all([
      fetch('/api/reminders'),
      fetch('/api/my-company')
    ]);
    setItems(reminderRes.ok ? await reminderRes.json() : []);
    if (profileRes.ok) {
      const profile = await profileRes.json();
      setCompanyEmails(normalizeEmails(profile.reminderEmails));
    }
    setLoading(false);
  };

  useEffect(() => { loadReminders().catch(() => setLoading(false)); }, []);

  const sendEmail = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/reminders/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAhead: 30 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || 'Failed to send reminder email.');
      alert(`${data.message} ${data.items} reminder item(s) included.`);
    } finally {
      setSending(false);
    }
  };

  const addReminderEmail = async () => {
    const email = normalizeEmails([newReminderEmail])[0];
    if (!email) return alert('Enter a valid reminder email.');
    setSavingEmail(true);
    try {
      const res = await fetch('/api/my-company/reminder-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || 'Failed to add reminder email.');
      setCompanyEmails(normalizeEmails(data.reminderEmails));
      setNewReminderEmail('');
    } finally {
      setSavingEmail(false);
    }
  };

  const removeReminderEmail = async (email) => {
    setSavingEmail(true);
    try {
      const res = await fetch(`/api/my-company/reminder-emails/${encodeURIComponent(email)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || 'Failed to remove reminder email.');
      setCompanyEmails(normalizeEmails(data.reminderEmails));
    } finally {
      setSavingEmail(false);
    }
  };

  const filtered = useMemo(() => items.filter(item => {
    if (category !== 'All' && item.category !== category) return false;
    if (status === 'Actionable') return item.status !== 'Upcoming';
    if (status !== 'All' && item.status !== status) return false;
    return true;
  }), [items, category, status]);

  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const columns = [
    { header: 'Category', key: 'category', render: item => item.category },
    { header: 'Subject', key: 'subject', render: item => <strong>{item.subject}</strong> },
    { header: 'Reminder', key: 'item', render: item => item.item },
    { header: 'Due Date', key: 'dueDate', render: item => dateText(item.dueDate), exportValue: item => dateText(item.dueDate) },
    { header: 'Days', key: 'days', render: item => item.days < 0 ? `${Math.abs(item.days)} overdue` : `${item.days} left`, exportValue: item => item.days },
    { header: 'Amount', key: 'amount', render: item => money(item.amount), exportValue: item => item.amount ?? '' },
    { header: 'Reference', key: 'reference', render: item => item.reference || '-' },
    { header: 'Owner / Lender', key: 'owner', render: item => item.owner || '-' },
    { header: 'Status', key: 'status', render: item => {
      const [bg, color] = tone(item.status);
      return <span style={{ background: bg, color, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 800 }}>{item.status}</span>;
    } }
  ];

  if (loading) return <div style={{ padding: '40px', fontWeight: 800 }}>Loading reminders...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1500px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a' }}>Reminders</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Driver, truck compliance, and loan due reminders.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setEmailModalOpen(true)} style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', color: '#0f172a', cursor: 'pointer', fontWeight: 800 }}>Manage Mail IDs</button>
          <button onClick={loadReminders} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: 800 }}>Refresh</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        <Stat label="Overdue" value={counts.Overdue || 0} color="#dc2626" />
        <Stat label="Due This Week" value={counts['Due This Week'] || 0} color="#ea580c" />
        <Stat label="Due Soon" value={counts['Due Soon'] || 0} color="#b45309" />
        <Stat label="Upcoming" value={counts.Upcoming || 0} color="#15803d" />
        <Stat label="Auto Mail IDs" value={companyEmails.length} color="#0f766e" />
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
          <option value="All">All categories</option>
          <option value="Driver">Driver</option>
          <option value="Truck">Truck</option>
          <option value="Loan">Loan</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
          <option value="Actionable">Overdue + Due Soon</option>
          <option value="All">All statuses</option>
          <option value="Overdue">Overdue</option>
          <option value="Due This Week">Due This Week</option>
          <option value="Due Soon">Due Soon</option>
          <option value="Upcoming">Upcoming</option>
        </select>
        <button
          type="button"
          onClick={sendEmail}
          disabled={sending}
          style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: sending ? '#94a3b8' : '#0f766e', color: 'white', cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 800 }}
        >
          {sending ? 'Sending...' : 'Send Email'}
        </button>
        <span style={{ alignSelf: 'center', color: '#64748b', fontSize: '13px', fontWeight: 700 }}>Auto: {triggerDays.join(', ')} days before due</span>
      </div>

      <DataTable data={filtered} columns={columns} title="Reminder Register" enableColumnFilters />

      {emailModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px' }}>
          <div style={{ width: 'min(560px, 100%)', background: 'white', borderRadius: '8px', boxShadow: '0 24px 60px rgba(15,23,42,0.28)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#0f172a' }}>Reminder Mail IDs</h3>
              <button type="button" onClick={() => setEmailModalOpen(false)} style={{ border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>x</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <input
                type="text"
                value={newReminderEmail}
                onChange={e => setNewReminderEmail(e.target.value)}
                placeholder="person@company.com"
                style={{ flex: '1 1 260px', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
              <button type="button" disabled={savingEmail} onClick={addReminderEmail} style={{ padding: '10px 14px', border: 0, borderRadius: '6px', background: savingEmail ? '#94a3b8' : '#0f766e', color: 'white', cursor: savingEmail ? 'not-allowed' : 'pointer', fontWeight: 800 }}>Add</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {companyEmails.length === 0 && <div style={{ padding: '18px', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#64748b' }}>No reminder mail IDs added.</div>}
              {companyEmails.map(email => (
                <div key={email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc' }}>
                  <strong style={{ color: '#0f172a', fontSize: '14px' }}>{email}</strong>
                  <button type="button" disabled={savingEmail} onClick={() => removeReminderEmail(email)} style={{ border: 0, background: 'transparent', color: '#dc2626', cursor: savingEmail ? 'not-allowed' : 'pointer', fontWeight: 800 }}>Remove</button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button type="button" onClick={() => setEmailModalOpen(false)} style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', color: '#0f172a', cursor: 'pointer', fontWeight: 800 }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
