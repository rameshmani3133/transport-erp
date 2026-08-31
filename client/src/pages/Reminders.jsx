import React, { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';

const money = (value) => value == null ? '-' : `Rs.${Number(value || 0).toFixed(2)}`;
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-';

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

  const loadReminders = async () => {
    setLoading(true);
    const res = await fetch('/api/reminders');
    setItems(res.ok ? await res.json() : []);
    setLoading(false);
  };

  useEffect(() => { loadReminders().catch(() => setLoading(false)); }, []);

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
        <button onClick={loadReminders} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: 800 }}>Refresh</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        <Stat label="Overdue" value={counts.Overdue || 0} color="#dc2626" />
        <Stat label="Due This Week" value={counts['Due This Week'] || 0} color="#ea580c" />
        <Stat label="Due Soon" value={counts['Due Soon'] || 0} color="#b45309" />
        <Stat label="Upcoming" value={counts.Upcoming || 0} color="#15803d" />
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
      </div>

      <DataTable data={filtered} columns={columns} title="Reminder Register" enableColumnFilters />
    </div>
  );
}
