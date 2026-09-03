import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import { useNavigate } from 'react-router-dom';

const money = (value) => `Rs.${Number(value || 0).toFixed(2)}`;
const today = () => new Date().toISOString().split('T')[0];
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-';
const fieldStyle = { padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' };

function Field({ label, children }) {
  return <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>{label}{children}</label>;
}

const initialLoan = {
  loanNo: '',
  lenderName: '',
  lenderBankName: '',
  lenderAccountNo: '',
  lenderIfscCode: '',
  lenderBranch: '',
  paymentStatus: 'Due',
  paidDate: '',
  financeAccountId: '',
  vehicleId: '',
  principalAmount: '',
  outstandingAmount: '',
  emiAmount: '',
  nextDueDate: today(),
  startDate: '',
  endDate: '',
  status: 'Active',
  remarks: ''
};

export default function LoanTracking() {
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [formData, setFormData] = useState(initialLoan);
  const [editId, setEditId] = useState(null);

  const loadData = async () => {
    const [loanRes, vehicleRes, accountRes] = await Promise.all([
      fetch('/api/loans'),
      fetch('/api/vehicles'),
      fetch('/api/ledger/accounts')
    ]);
    if (loanRes.ok) setLoans(await loanRes.json());
    if (vehicleRes.ok) setVehicles(await vehicleRes.json());
    if (accountRes.ok) setAccounts(await accountRes.json());
  };

  useEffect(() => { loadData().catch(console.error); }, []);

  const setField = (name, value) => setFormData(prev => ({ ...prev, [name]: value }));
  const reset = () => {
    setFormData(initialLoan);
    setEditId(null);
  };

  const editLoan = (loan) => {
    setEditId(loan.id);
    setFormData({
      loanNo: loan.loanNo || '',
      lenderName: loan.lenderName || '',
      lenderBankName: loan.lenderBankName || '',
      lenderAccountNo: loan.lenderAccountNo || '',
      lenderIfscCode: loan.lenderIfscCode || '',
      lenderBranch: loan.lenderBranch || '',
      paymentStatus: loan.paymentStatus || 'Due',
      paidDate: loan.paidDate ? new Date(loan.paidDate).toISOString().split('T')[0] : '',
      financeAccountId: loan.financeAccountId || '',
      vehicleId: loan.vehicleId || '',
      principalAmount: loan.principalAmount || '',
      outstandingAmount: loan.outstandingAmount || '',
      emiAmount: loan.emiAmount || '',
      nextDueDate: loan.nextDueDate ? new Date(loan.nextDueDate).toISOString().split('T')[0] : today(),
      startDate: loan.startDate ? new Date(loan.startDate).toISOString().split('T')[0] : '',
      endDate: loan.endDate ? new Date(loan.endDate).toISOString().split('T')[0] : '',
      status: loan.status || 'Active',
      remarks: loan.remarks || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveLoan = async (event) => {
    event.preventDefault();
    const res = await fetch(editId ? `/api/loans/${editId}` : '/api/loans', {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Failed to save loan.');
    alert(`Loan ${editId ? 'updated' : 'created'}.`);
    reset();
    loadData();
  };

  const deleteLoan = async (id) => {
    if (!(await window.confirmSnackbar('Delete this loan record?'))) return;
    const res = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
    if (!res.ok) return alert('Failed to delete loan.');
    loadData();
  };

  const updatePaymentStatus = async (loan, paymentStatus) => {
    if (paymentStatus === 'Paid') {
      navigate('/payments', { state: { voucherType: 'LOAN_EMI', loanId: loan.id } });
      return;
    }
    let paidDate = loan.paidDate ? new Date(loan.paidDate).toISOString().split('T')[0] : today();
    const res = await fetch(`/api/loans/${loan.id}/payment-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentStatus, paidDate })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Failed to update payment status.');
    setLoans(prev => prev.map(item => item.id === loan.id ? data : item));
  };

  const columns = [
    { header: 'Loan No', key: 'loanNo', render: loan => <strong>{loan.loanNo || '-'}</strong> },
    { header: 'Bank / Finance', key: 'lenderName', render: loan => loan.lenderName },
    { header: 'Provider Bank', key: 'lenderBankName', render: loan => loan.lenderBankName || '-' },
    { header: 'Account No', key: 'lenderAccountNo', render: loan => loan.lenderAccountNo || '-' },
    { header: 'IFSC', key: 'lenderIfscCode', render: loan => loan.lenderIfscCode || '-' },
    { header: 'Vehicle', key: 'vehicle.regNo', render: loan => loan.vehicle?.regNo || '-' },
    { header: 'Loan Amount', key: 'principalAmount', render: loan => money(loan.principalAmount), exportValue: loan => loan.principalAmount },
    { header: 'Outstanding', key: 'outstandingAmount', render: loan => <strong>{money(loan.outstandingAmount)}</strong>, exportValue: loan => loan.outstandingAmount },
    { header: 'EMI', key: 'emiAmount', render: loan => money(loan.emiAmount), exportValue: loan => loan.emiAmount },
    { header: 'Monthly Due Date', key: 'nextDueDate', render: loan => dateText(loan.nextDueDate), exportValue: loan => dateText(loan.nextDueDate) },
    { header: 'Paid Date', key: 'paidDate', render: loan => dateText(loan.paidDate), exportValue: loan => dateText(loan.paidDate) },
    { header: 'Payment Status', key: 'paymentStatus', render: loan => (
      <select value={loan.paymentStatus || 'Due'} onChange={e => updatePaymentStatus(loan, e.target.value)} style={{ ...fieldStyle, minWidth: '120px', fontWeight: 800 }}>
        <option value="Due">Due</option>
        <option value="Paid">Paid</option>
        <option value="Part Paid">Part Paid</option>
        <option value="Overdue">Overdue</option>
        <option value="Skipped">Skipped</option>
      </select>
    ), exportValue: loan => loan.paymentStatus || 'Due' },
    { header: 'Loan Status', key: 'status', render: loan => loan.status },
    { header: 'Actions', key: 'actions', render: loan => (
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={() => editLoan(loan)} style={{ color: '#2563eb', border: 0, background: 'none', cursor: 'pointer', fontWeight: 800 }}>Edit</button>
        <button type="button" onClick={() => deleteLoan(loan.id)} style={{ color: '#dc2626', border: 0, background: 'none', cursor: 'pointer', fontWeight: 800 }}>Delete</button>
      </div>
    ) }
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ color: '#0f172a', marginBottom: '18px' }}>Loan Tracking</h2>
      <form onSubmit={saveLoan} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '28px', boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
          <Field label="Loan Number"><input value={formData.loanNo} onChange={e => setField('loanNo', e.target.value)} style={fieldStyle} /></Field>
          <Field label="Bank / Finance"><input value={formData.lenderName} onChange={e => setField('lenderName', e.target.value)} required style={fieldStyle} /></Field>
          <Field label="Provider Bank Name"><input value={formData.lenderBankName} onChange={e => setField('lenderBankName', e.target.value)} style={fieldStyle} /></Field>
          <Field label="Provider Account No"><input value={formData.lenderAccountNo} onChange={e => setField('lenderAccountNo', e.target.value)} style={fieldStyle} /></Field>
          <Field label="Provider IFSC"><input value={formData.lenderIfscCode} onChange={e => setField('lenderIfscCode', e.target.value)} style={fieldStyle} /></Field>
          <Field label="Provider Branch"><input value={formData.lenderBranch} onChange={e => setField('lenderBranch', e.target.value)} style={fieldStyle} /></Field>
          <Field label="Finance Ledger">
            <select value={formData.financeAccountId} onChange={e => setField('financeAccountId', e.target.value)} style={fieldStyle}>
              <option value="">Optional ledger</option>
              {accounts.filter(a => a.accountType === 'Liability' || a.accountGroup?.includes('Loan') || a.accountGroup?.includes('Finance')).map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </Field>
          <Field label="Linked Truck">
            <select value={formData.vehicleId} onChange={e => setField('vehicleId', e.target.value)} style={fieldStyle}>
              <option value="">General loan</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNo}</option>)}
            </select>
          </Field>
          <Field label="Loan Amount"><input type="number" step="any" value={formData.principalAmount} onChange={e => setField('principalAmount', e.target.value)} required style={fieldStyle} /></Field>
          <Field label="Outstanding Amount"><input type="number" step="any" value={formData.outstandingAmount} onChange={e => setField('outstandingAmount', e.target.value)} required style={fieldStyle} /></Field>
          <Field label="EMI / Due Amount"><input type="number" step="any" value={formData.emiAmount} onChange={e => setField('emiAmount', e.target.value)} required style={fieldStyle} /></Field>
          <Field label="Monthly Due Date"><input type="date" value={formData.nextDueDate} onChange={e => setField('nextDueDate', e.target.value)} required style={fieldStyle} /></Field>
          <Field label="Paid Date"><input type="date" value={formData.paidDate} onChange={e => setField('paidDate', e.target.value)} style={fieldStyle} /></Field>
          <Field label="Payment Status">
            <select value={formData.paymentStatus} onChange={e => setField('paymentStatus', e.target.value)} style={fieldStyle}>
              <option value="Due">Due</option>
              <option value="Paid">Paid</option>
              <option value="Part Paid">Part Paid</option>
              <option value="Overdue">Overdue</option>
              <option value="Skipped">Skipped</option>
            </select>
          </Field>
          <Field label="Start Date"><input type="date" value={formData.startDate} onChange={e => setField('startDate', e.target.value)} style={fieldStyle} /></Field>
          <Field label="End Date"><input type="date" value={formData.endDate} onChange={e => setField('endDate', e.target.value)} style={fieldStyle} /></Field>
          <Field label="Status">
            <select value={formData.status} onChange={e => setField('status', e.target.value)} style={fieldStyle}>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
              <option value="On Hold">On Hold</option>
            </select>
          </Field>
          <Field label="Remarks"><input value={formData.remarks} onChange={e => setField('remarks', e.target.value)} style={fieldStyle} /></Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          {editId && <button type="button" onClick={reset} style={{ padding: '10px 16px', border: 0, borderRadius: '6px', background: '#e2e8f0', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>}
          <button type="submit" style={{ padding: '10px 18px', border: 0, borderRadius: '6px', background: '#2563eb', color: 'white', fontWeight: 800, cursor: 'pointer' }}>{editId ? 'Update Loan' : 'Save Loan'}</button>
        </div>
      </form>
      <DataTable data={loans} columns={columns} title="Loan Register" enableColumnFilters recycleBinType="loans" onRecycleChanged={loadData} onNavigateRecord={editLoan} activeRecordId={editId} />
    </div>
  );
}
