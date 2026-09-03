import React, { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import { useNavigate } from 'react-router-dom';

const fieldStyle = { padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' };
const money = value => `Rs.${Number(value || 0).toFixed(2)}`;
const dateInput = value => value ? new Date(value).toISOString().split('T')[0] : '';
const dateText = value => value ? new Date(value).toLocaleDateString('en-IN') : '-';
const today = () => new Date().toISOString().split('T')[0];
const initialForm = {
  category: 'Rent', billName: '', providerName: '', consumerNumber: '', amount: '',
  nextDueDate: today(), paymentStatus: 'Due', reminderEnabled: true,
  startDate: '', endDate: '', status: 'Active', remarks: ''
};
const initialPayment = { paidDate: today(), amount: '', paymentMode: 'Bank Transfer', referenceNumber: '', remarks: '' };

function Field({ label, children }) {
  return <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>{label}{children}</label>;
}

function Stat({ label, value, color }) {
  return <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}><div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700 }}>{label}</div><div style={{ color, fontSize: '22px', fontWeight: 900, marginTop: '4px' }}>{value}</div></div>;
}

export default function RecurringBills() {
  const navigate = useNavigate();
  const [bills, setBills] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editId, setEditId] = useState(null);
  const [payingBill, setPayingBill] = useState(null);
  const [payment, setPayment] = useState(initialPayment);
  const [historyBillId, setHistoryBillId] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    const res = await fetch('/api/recurring-bills');
    const data = await res.json().catch(() => []);
    if (!res.ok) return alert(data.error || 'Failed to load monthly bills.');
    setBills(data);
  };

  useEffect(() => { loadData().catch(console.error); }, []);

  const summary = useMemo(() => {
    const active = bills.filter(bill => bill.status === 'Active');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return {
      active: active.length,
      monthly: active.reduce((sum, bill) => sum + Number(bill.amount || 0), 0),
      overdue: active.filter(bill => new Date(bill.nextDueDate) < now).length,
      dueSoon: active.filter(bill => { const days = Math.ceil((new Date(bill.nextDueDate) - now) / 86400000); return days >= 0 && days <= 7; }).length
    };
  }, [bills]);

  const reset = () => { setForm(initialForm); setEditId(null); };
  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const editBill = bill => {
    setEditId(bill.id);
    setForm({
      category: bill.category || 'Other', billName: bill.billName || '', providerName: bill.providerName || '',
      consumerNumber: bill.consumerNumber || '', amount: bill.amount ?? '', nextDueDate: dateInput(bill.nextDueDate),
      paymentStatus: bill.paymentStatus || 'Due', reminderEnabled: bill.reminderEnabled !== false,
      startDate: dateInput(bill.startDate), endDate: dateInput(bill.endDate), status: bill.status || 'Active', remarks: bill.remarks || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveBill = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const res = await fetch(editId ? `/api/recurring-bills/${editId}` : '/api/recurring-bills', {
        method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || 'Failed to save monthly bill.');
      reset(); await loadData();
    } finally { setSaving(false); }
  };

  const openPayment = bill => {
    setPayingBill(bill);
    setPayment({ ...initialPayment, amount: bill.amount });
  };

  const recordPayment = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const res = await fetch(`/api/recurring-bills/${payingBill.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payment)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || 'Failed to record payment.');
      setPayingBill(null); await loadData();
    } finally { setSaving(false); }
  };

  const deleteBill = async bill => {
    if (!(await window.confirmSnackbar(`Delete ${bill.billName}? Payment history will move to the recycle bin too.`))) return;
    const res = await fetch(`/api/recurring-bills/${bill.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Failed to delete monthly bill.');
    await loadData();
  };

  const columns = [
    { header: 'Category', key: 'category' },
    { header: 'Bill / Payment', key: 'billName', render: bill => <strong>{bill.billName}</strong> },
    { header: 'Provider', key: 'providerName', render: bill => bill.providerName || '-' },
    { header: 'Consumer / Ref No', key: 'consumerNumber', render: bill => bill.consumerNumber || '-' },
    { header: 'Monthly Amount', key: 'amount', render: bill => <strong>{money(bill.amount)}</strong>, exportValue: bill => bill.amount },
    { header: 'Next Due', key: 'nextDueDate', render: bill => dateText(bill.nextDueDate), exportValue: bill => dateText(bill.nextDueDate) },
    { header: 'Last Paid', key: 'lastPaidDate', render: bill => dateText(bill.lastPaidDate), exportValue: bill => dateText(bill.lastPaidDate) },
    { header: 'Reminder', key: 'reminderEnabled', sortValue: bill => bill.reminderEnabled ? 1 : 0, render: bill => bill.reminderEnabled ? 'Enabled' : 'Disabled' },
    { header: 'Status', key: 'status' },
    { header: 'Actions', key: 'actions', render: bill => <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {bill.status === 'Active' && <button type="button" onClick={() => navigate('/payments', { state: { voucherType: 'MONTHLY_BILL_PAYMENT', recurringBillId: bill.id } })} style={{ border: 0, background: 'none', color: '#0f766e', cursor: 'pointer', fontWeight: 800 }}>Pay by Voucher</button>}
      <button type="button" onClick={() => setHistoryBillId(historyBillId === bill.id ? null : bill.id)} style={{ border: 0, background: 'none', color: '#7c3aed', cursor: 'pointer', fontWeight: 800 }}>History ({bill.payments?.length || 0})</button>
      <button type="button" onClick={() => editBill(bill)} style={{ border: 0, background: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 800 }}>Edit</button>
      <button type="button" onClick={() => deleteBill(bill)} style={{ border: 0, background: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 800 }}>Delete</button>
    </div> }
  ];

  const historyBill = bills.find(bill => bill.id === historyBillId);

  return <div style={{ padding: '20px', maxWidth: '1500px', margin: '0 auto' }}>
    <div style={{ marginBottom: '18px' }}><h2 style={{ margin: 0, color: '#0f172a' }}>Monthly Bills & Payments</h2><p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>Track rent, EB, utilities, subscriptions, and other recurring company payments.</p></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
      <Stat label="Active Payments" value={summary.active} color="#2563eb" /><Stat label="Monthly Commitment" value={money(summary.monthly)} color="#0f766e" /><Stat label="Overdue" value={summary.overdue} color="#dc2626" /><Stat label="Due in 7 Days" value={summary.dueSoon} color="#ea580c" />
    </div>
    <form onSubmit={saveBill} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '24px', boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
        <Field label="Category"><select value={form.category} onChange={e => setField('category', e.target.value)} style={fieldStyle}><option>Rent</option><option>Electricity / EB</option><option>Water</option><option>Internet</option><option>Telephone</option><option>Insurance</option><option>Subscription</option><option>Maintenance</option><option>Tax / License</option><option>Other</option></select></Field>
        <Field label="Bill / Payment Name"><input value={form.billName} onChange={e => setField('billName', e.target.value)} required placeholder="Office rent" style={fieldStyle} /></Field>
        <Field label="Provider / Landlord"><input value={form.providerName} onChange={e => setField('providerName', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Consumer / Reference No"><input value={form.consumerNumber} onChange={e => setField('consumerNumber', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Monthly Amount"><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setField('amount', e.target.value)} required style={fieldStyle} /></Field>
        <Field label="Next Due Date"><input type="date" value={form.nextDueDate} onChange={e => setField('nextDueDate', e.target.value)} required style={fieldStyle} /></Field>
        <Field label="Start Date"><input type="date" value={form.startDate} onChange={e => setField('startDate', e.target.value)} style={fieldStyle} /></Field>
        <Field label="End Date"><input type="date" value={form.endDate} onChange={e => setField('endDate', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Status"><select value={form.status} onChange={e => setField('status', e.target.value)} style={fieldStyle}><option>Active</option><option>On Hold</option><option>Closed</option></select></Field>
        <Field label="Remarks"><input value={form.remarks} onChange={e => setField('remarks', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Reminder"><label style={{ display: 'flex', gap: '8px', alignItems: 'center', minHeight: '36px' }}><input type="checkbox" checked={form.reminderEnabled} onChange={e => setField('reminderEnabled', e.target.checked)} /> Include in reminder dashboard and email</label></Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>{editId && <button type="button" onClick={reset} style={{ padding: '10px 16px', border: 0, borderRadius: '6px', background: '#e2e8f0', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>}<button disabled={saving} type="submit" style={{ padding: '10px 18px', border: 0, borderRadius: '6px', background: saving ? '#94a3b8' : '#2563eb', color: 'white', fontWeight: 800, cursor: 'pointer' }}>{editId ? 'Update Payment Plan' : 'Save Payment Plan'}</button></div>
    </form>
    <DataTable data={bills} columns={columns} title="Monthly Payment Register" enableColumnFilters recycleBinType="recurringBills" onRecycleChanged={loadData} />
    {historyBill && <div style={{ marginTop: '18px', background: 'white', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '16px' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Payment History — {historyBill.billName}</h3><button onClick={() => setHistoryBillId(null)} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 800 }}>Close</button></div>{!historyBill.payments?.length ? <p style={{ color: '#64748b' }}>No payments recorded yet.</p> : <div style={{ overflowX: 'auto', marginTop: '12px' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}><thead><tr>{['Due Date','Paid Date','Amount','Mode','Reference','Remarks'].map(label => <th key={label} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>{label}</th>)}</tr></thead><tbody>{historyBill.payments.map(item => <tr key={item.id}><td style={{ padding: '8px' }}>{dateText(item.dueDate)}</td><td style={{ padding: '8px' }}>{dateText(item.paidDate)}</td><td style={{ padding: '8px' }}>{money(item.amount)}</td><td style={{ padding: '8px' }}>{item.paymentMode || '-'}</td><td style={{ padding: '8px' }}>{item.referenceNumber || '-'}</td><td style={{ padding: '8px' }}>{item.remarks || '-'}</td></tr>)}</tbody></table></div>}</div>}
    {payingBill && <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 60, display: 'grid', placeItems: 'center', padding: '20px' }}><form onSubmit={recordPayment} style={{ width: 'min(600px, 100%)', background: 'white', borderRadius: '10px', padding: '20px' }}><h3 style={{ marginTop: 0 }}>Record Payment — {payingBill.billName}</h3><p style={{ color: '#64748b' }}>This records the payment and advances the next due date from {dateText(payingBill.nextDueDate)} by one month.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}><Field label="Paid Date"><input type="date" value={payment.paidDate} onChange={e => setPayment({ ...payment, paidDate: e.target.value })} required style={fieldStyle} /></Field><Field label="Amount Paid"><input type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} required style={fieldStyle} /></Field><Field label="Payment Mode"><select value={payment.paymentMode} onChange={e => setPayment({ ...payment, paymentMode: e.target.value })} style={fieldStyle}><option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Cash</option><option>Auto Debit</option><option>Other</option></select></Field><Field label="Reference Number"><input value={payment.referenceNumber} onChange={e => setPayment({ ...payment, referenceNumber: e.target.value })} style={fieldStyle} /></Field><Field label="Remarks"><input value={payment.remarks} onChange={e => setPayment({ ...payment, remarks: e.target.value })} style={fieldStyle} /></Field></div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}><button type="button" onClick={() => setPayingBill(null)} style={{ padding: '10px 16px', border: 0, borderRadius: '6px', cursor: 'pointer' }}>Cancel</button><button disabled={saving} type="submit" style={{ padding: '10px 16px', border: 0, borderRadius: '6px', background: '#0f766e', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Record & Advance Due Date</button></div></form></div>}
  </div>;
}
