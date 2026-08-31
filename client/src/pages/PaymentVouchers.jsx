import React, { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';

const money = (value) => `Rs.${Number(value || 0).toFixed(2)}`;
const today = () => new Date().toISOString().split('T')[0];
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-';

function voucherNoFromNarration(narration) {
  return String(narration || '').match(/\[(PV-\d+)\]$/)?.[1] || '';
}

export default function PaymentVouchers() {
  const [accounts, setAccounts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [entries, setEntries] = useState([]);
  const [formData, setFormData] = useState({
    type: 'CLIENT_RECEIPT',
    date: today(),
    partyAccountId: '',
    cashBankAccountId: '',
    invoiceId: '',
    amount: '',
    paymentMode: 'Bank',
    referenceNo: '',
    remarks: ''
  });

  const fetchData = async () => {
    const [aRes, iRes, pRes] = await Promise.all([
      fetch('/api/ledger/accounts'),
      fetch('/api/invoices'),
      fetch('/api/payments')
    ]);
    if (aRes.ok) setAccounts(await aRes.json());
    if (iRes.ok) setInvoices(await iRes.json());
    if (pRes.ok) setEntries(await pRes.json());
  };

  useEffect(() => { fetchData().catch(console.error); }, []);

  const cashBankAccounts = accounts.filter(a => a.accountGroup?.includes('Cash') || a.accountGroup?.includes('Bank'));
  const partyAccounts = accounts.filter(a => {
    if (formData.type === 'CLIENT_RECEIPT') return a.accountGroup?.includes('Sundry Debtors');
    if (formData.type === 'PUMP_PAYMENT') return a.accountGroup?.includes('Fuel Pump');
    if (formData.type === 'DRIVER_PAYMENT') return a.accountGroup?.includes('Loans & Advances');
    return a.accountGroup?.includes('Sundry Creditors');
  });

  const openInvoices = invoices.filter(inv => inv.status !== 'Paid');

  const vouchers = useMemo(() => {
    const byVoucher = new Map();
    entries.forEach(entry => {
      const voucherNo = voucherNoFromNarration(entry.narration);
      if (!voucherNo) return;
      const current = byVoucher.get(voucherNo) || { id: voucherNo, voucherNo, date: entry.date, narration: entry.narration, debit: null, credit: null, amount: entry.amount };
      if (entry.type === 'Dr') current.debit = entry.account?.accountName;
      if (entry.type === 'Cr') current.credit = entry.account?.accountName;
      current.invoiceNo = entry.invoice?.invoiceNo || current.invoiceNo;
      byVoucher.set(voucherNo, current);
    });
    return Array.from(byVoucher.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries]);

  const selectedInvoice = invoices.find(inv => String(inv.id) === String(formData.invoiceId));

  useEffect(() => {
    if (!selectedInvoice || formData.type !== 'CLIENT_RECEIPT') return;
    const clientId = selectedInvoice.location?.company?.id;
    const clientAccount = accounts.find(a => String(a.clientId) === String(clientId));
    setFormData(prev => ({
      ...prev,
      partyAccountId: clientAccount ? String(clientAccount.id) : prev.partyAccountId,
      amount: prev.amount || selectedInvoice.balanceAmount || ''
    }));
  }, [selectedInvoice?.id, accounts, formData.type]);

  const submit = async (event) => {
    event.preventDefault();
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed to post payment voucher.');
    alert(`Voucher posted: ${data.voucherNo}`);
    setFormData({ type: 'CLIENT_RECEIPT', date: today(), partyAccountId: '', cashBankAccountId: '', invoiceId: '', amount: '', paymentMode: 'Bank', referenceNo: '', remarks: '' });
    fetchData();
  };

  const removeVoucher = async (voucherNo) => {
    if (!(await window.confirmSnackbar(`Delete voucher ${voucherNo}? This will reverse both ledger sides.`))) return;
    const res = await fetch(`/api/payments/${voucherNo}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed to delete voucher.');
    fetchData();
  };

  const columns = [
    { header: 'Voucher', key: 'voucherNo', render: v => <strong>{v.voucherNo}</strong> },
    { header: 'Date', key: 'date', render: v => dateText(v.date) },
    { header: 'Debit', key: 'debit', render: v => v.debit || '-' },
    { header: 'Credit', key: 'credit', render: v => v.credit || '-' },
    { header: 'Invoice', key: 'invoiceNo', render: v => v.invoiceNo || '-' },
    { header: 'Amount', key: 'amount', render: v => <strong>{money(v.amount)}</strong> },
    { header: 'Actions', key: 'actions', render: v => <button onClick={() => removeVoucher(v.voucherNo)} style={{ color: '#dc2626', background: 'none', border: 0, cursor: 'pointer', fontWeight: 'bold' }}>Delete</button> }
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ color: '#0f172a', marginBottom: '20px' }}>Payment Vouchers</h2>
      <form onSubmit={submit} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '28px', boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Voucher Type
            <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value, partyAccountId: '', invoiceId: '' })} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
              <option value="CLIENT_RECEIPT">Client Receipt</option>
              <option value="VENDOR_PAYMENT">Vendor Payment</option>
              <option value="PUMP_PAYMENT">Fuel Pump Payment</option>
              <option value="DRIVER_PAYMENT">Driver Payment</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Date
            <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
          </label>
          <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Party Ledger
            <select value={formData.partyAccountId} onChange={e => setFormData({ ...formData, partyAccountId: e.target.value })} required style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
              <option value="">Select party</option>
              {partyAccounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Cash/Bank
            <select value={formData.cashBankAccountId} onChange={e => setFormData({ ...formData, cashBankAccountId: e.target.value })} required style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
              <option value="">Select cash/bank</option>
              {cashBankAccounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </label>
          {formData.type === 'CLIENT_RECEIPT' && (
            <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Invoice
              <select value={formData.invoiceId} onChange={e => setFormData({ ...formData, invoiceId: e.target.value })} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                <option value="">General receipt</option>
                {openInvoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoiceNo} - {money(inv.balanceAmount)}</option>)}
              </select>
            </label>
          )}
          <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Amount
            <input type="number" step="any" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} required style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
          </label>
          <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Reference
            <input value={formData.referenceNo} onChange={e => setFormData({ ...formData, referenceNo: e.target.value })} placeholder="UTR / cheque no" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
          </label>
          <button type="submit" style={{ padding: '11px 18px', background: '#0f766e', color: 'white', border: 0, borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}>Post Voucher</button>
        </div>
      </form>
      <DataTable data={vouchers} columns={columns} title="Payment Voucher History" />
    </div>
  );
}

