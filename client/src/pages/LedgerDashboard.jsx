import React, { useCallback, useEffect, useState } from 'react';
import DataTable from '../components/DataTable';

const money = (value) => `Rs.${Number(value || 0).toFixed(2)}`;
const today = () => new Date().toISOString().split('T')[0];
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-';
const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '13px',
    background: 'white'
};
const labelStyle = {
    display: 'grid',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#475569'
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[char]));

export default function LedgerDashboard() {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [exportTransactions, setExportTransactions] = useState([]);
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterType, setFilterType] = useState('All');
    const [voucher, setVoucher] = useState({ debitAccountId: '', creditAccountId: '', amount: '', narration: '', date: today() });
    const debitAccount = accounts.find(a => String(a.id) === String(voucher.debitAccountId));
    const creditAccount = accounts.find(a => String(a.id) === String(voucher.creditAccountId));

    const fetchAccounts = async () => {
        const res = await fetch('/api/ledger/accounts');
        if (res.ok) setAccounts(await res.json());
    };

    useEffect(() => { fetchAccounts().catch(console.error); }, []);

    const viewStatement = async (accountId) => {
        const acc = accounts.find(a => a.id === accountId);
        setSelectedAccount(acc);
        const res = await fetch(`/api/ledger/transactions/${accountId}`);
        if (res.ok) setTransactions(await res.json());
    };

    const postVoucher = async (event) => {
        event.preventDefault();
        if (voucher.debitAccountId === voucher.creditAccountId) return alert('Debit and credit accounts cannot be the same.');
        const res = await fetch('/api/ledger/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(voucher)
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error || 'Failed to post voucher.');
        alert(`Voucher posted: ${data.voucherId}`);
        setVoucher({ debitAccountId: '', creditAccountId: '', amount: '', narration: '', date: today() });
        await fetchAccounts();
        if (selectedAccount) viewStatement(selectedAccount.id);
    };

    const deleteManualVoucher = async (id) => {
        if (!(await window.confirmSnackbar('Delete this manual voucher? Both sides will be reversed.'))) return;
        const res = await fetch(`/api/ledger/manual/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return alert(data.error || 'Failed to delete voucher.');
        await fetchAccounts();
        if (selectedAccount) viewStatement(selectedAccount.id);
    };

    const filteredTransactions = transactions.filter(t => {
        if (filterStartDate && new Date(t.date) < new Date(filterStartDate)) return false;
        if (filterEndDate && new Date(t.date) > new Date(filterEndDate)) return false;
        if (filterType !== 'All' && t.type !== filterType) return false;
        return true;
    });

    const handleProcessedTransactions = useCallback((nextRows) => {
        setExportTransactions(currentRows => {
            const unchanged = currentRows.length === nextRows.length
                && currentRows.every((row, index) => row === nextRows[index]);
            return unchanged ? currentRows : nextRows;
        });
    }, []);

    const handleExportCSV = () => {
        if (!exportTransactions.length) return alert('No transactions to export.');
        const rows = exportTransactions.map(t => {
            const ref = t.voucher?.voucherNo || t.trip?.tripNo || t.invoice?.invoiceNo || t.settlement?.settlementNo || t.driverSettlement?.settlementNo || 'Manual Voucher';
            return [dateText(t.date), t.narration || '', ref, t.type === 'Dr' ? Number(t.amount || 0).toFixed(2) : '', t.type === 'Cr' ? Number(t.amount || 0).toFixed(2) : '']
                .map(value => `"${String(value).replace(/"/g, '""')}"`).join(',');
        });
        const csvContent = 'data:text/csv;charset=utf-8,' + ['Date,Narration,Reference,Debit (Dr),Credit (Cr)', ...rows].join('\n');
        const link = document.createElement('a');
        link.setAttribute('href', encodeURI(csvContent));
        link.setAttribute('download', `${selectedAccount.accountName.replace(/\s+/g, '_')}_Statement_${today()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportPDF = () => {
        if (!exportTransactions.length) return alert('No transactions to print.');
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html><head><title>${escapeHtml(selectedAccount.accountName)} - Ledger Statement</title>
            <style>body{font-family:Arial,sans-serif;padding:20px;color:#111827}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#f1f5f9}.right{text-align:right}</style></head>
            <body><h2>${escapeHtml(selectedAccount.accountName)}</h2><p>${escapeHtml(selectedAccount.accountGroup)} | Balance: ${money(selectedAccount.currentBalance)} ${selectedAccount.balanceType}</p>
            <table><thead><tr><th>Date</th><th>Narration</th><th>Reference</th><th class="right">Dr</th><th class="right">Cr</th></tr></thead><tbody>
            ${exportTransactions.map(t => `<tr><td>${dateText(t.date)}</td><td>${escapeHtml(t.narration || '-')}</td><td>${escapeHtml(t.voucher?.voucherNo || t.trip?.tripNo || t.invoice?.invoiceNo || t.settlement?.settlementNo || t.driverSettlement?.settlementNo || 'Manual Voucher')}</td><td class="right">${t.type === 'Dr' ? money(t.amount) : '-'}</td><td class="right">${t.type === 'Cr' ? money(t.amount) : '-'}</td></tr>`).join('')}
            </tbody></table><script>window.onload=()=>{window.print();window.close()}</script></body></html>`);
        printWindow.document.close();
    };

    const accountColumns = [
        { header: 'Account Name', key: 'accountName', render: a => <strong>{a.accountName}</strong> },
        { header: 'Type', key: 'accountType', render: a => a.accountType },
        { header: 'Group', key: 'accountGroup', render: a => a.accountGroup },
        { header: 'Balance', key: 'currentBalance', render: a => <strong style={{ color: a.currentBalance >= 0 ? '#0f766e' : '#dc2626' }}>{money(a.currentBalance)} {a.balanceType}</strong> },
        { header: 'Actions', key: 'actions', render: a => <button onClick={() => viewStatement(a.id)} style={{ padding: '7px 12px', background: '#2563eb', color: 'white', border: 0, borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>Statement</button> }
    ];

    const txnColumns = [
        { header: 'Date', key: 'date', render: t => dateText(t.date) },
        { header: 'Narration', key: 'narration', render: t => t.narration || '-' },
        { header: 'Reference', key: 'ref', sortValue: t => t.voucher?.voucherNo || t.trip?.tripNo || t.invoice?.invoiceNo || t.settlement?.settlementNo || t.driverSettlement?.settlementNo || 'Manual Voucher', render: t => t.voucher?.voucherNo || t.trip?.tripNo || t.invoice?.invoiceNo || t.settlement?.settlementNo || t.driverSettlement?.settlementNo || 'Manual Voucher' },
        { header: 'Debit', key: 'debit', sortValue: t => t.type === 'Dr' ? Number(t.amount || 0) : null, render: t => t.type === 'Dr' ? <strong style={{ color: '#0f766e' }}>{money(t.amount)}</strong> : '-' },
        { header: 'Credit', key: 'credit', sortValue: t => t.type === 'Cr' ? Number(t.amount || 0) : null, render: t => t.type === 'Cr' ? <strong style={{ color: '#b45309' }}>{money(t.amount)}</strong> : '-' },
        { header: 'Actions', key: 'actions', render: t => {
            const isManual = !t.tripId && !t.invoiceId && !t.settlementId && !t.dieselId && !t.driverSettlementId && !t.voucherId;
            return isManual ? <button onClick={() => deleteManualVoucher(t.id)} style={{ background: 'none', border: 0, color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>Delete</button> : <span style={{ color: '#94a3b8', fontSize: '12px' }}>Auto-System</span>;
        }}
    ];

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <h2 style={{ color: '#0f172a', marginBottom: '18px' }}>General Ledger Dashboard</h2>

            <form onSubmit={postVoucher} style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px', boxShadow: '0 8px 24px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc' }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '16px' }}>Post Voucher</h3>
                        <span style={{ color: '#64748b', fontSize: '12px' }}>Manual journal entry</span>
                    </div>
                    <strong style={{ color: '#0f766e', fontSize: '18px' }}>{money(voucher.amount)}</strong>
                </div>

                <div style={{ padding: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
                    <div style={{ border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px', background: '#eff6ff' }}>
                        <label style={labelStyle}>Debit Account
                            <select value={voucher.debitAccountId} onChange={e => setVoucher({ ...voucher, debitAccountId: e.target.value })} required style={inputStyle}>
                                <option value="">Choose debit account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.accountName} ({a.accountGroup})</option>)}
                            </select>
                        </label>
                        <div style={{ marginTop: '10px', color: '#1d4ed8', fontSize: '12px', minHeight: '32px' }}>
                            {debitAccount ? <><strong>{debitAccount.accountName}</strong><br />{debitAccount.accountGroup}</> : 'Debit side'}
                        </div>
                    </div>

                    <div style={{ border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px', background: '#f0fdf4' }}>
                        <label style={labelStyle}>Credit Account
                            <select value={voucher.creditAccountId} onChange={e => setVoucher({ ...voucher, creditAccountId: e.target.value })} required style={inputStyle}>
                                <option value="">Choose credit account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.accountName} ({a.accountGroup})</option>)}
                            </select>
                        </label>
                        <div style={{ marginTop: '10px', color: '#15803d', fontSize: '12px', minHeight: '32px' }}>
                            {creditAccount ? <><strong>{creditAccount.accountName}</strong><br />{creditAccount.accountGroup}</> : 'Credit side'}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Date
                            <input type="date" value={voucher.date} onChange={e => setVoucher({ ...voucher, date: e.target.value })} required style={inputStyle} />
                        </label>
                        <label style={labelStyle}>Amount
                            <input type="number" step="any" min="0" value={voucher.amount} onChange={e => setVoucher({ ...voucher, amount: e.target.value })} required style={inputStyle} />
                        </label>
                    </div>

                    <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Narration
                        <textarea value={voucher.narration} onChange={e => setVoucher({ ...voucher, narration: e.target.value })} required rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.4 }} />
                    </label>

                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                        <button type="button" onClick={() => setVoucher({ debitAccountId: '', creditAccountId: '', amount: '', narration: '', date: today() })} style={{ padding: '10px 16px', background: '#e2e8f0', color: '#334155', border: 0, borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}>Clear</button>
                        <button type="submit" style={{ padding: '10px 18px', background: '#0f766e', color: 'white', border: 0, borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}>Post Voucher</button>
                    </div>
                </div>
            </form>

            <DataTable data={accounts} columns={accountColumns} title="Chart of Accounts Balances" recycleBinType="accounts" onRecycleChanged={fetchAccounts} />

            {selectedAccount && (
                <div style={{ marginTop: '28px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '18px', boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div><h3 style={{ margin: 0 }}>Statement: {selectedAccount.accountName}</h3><span style={{ color: '#64748b', fontSize: '13px' }}>{selectedAccount.accountGroup} | {money(selectedAccount.currentBalance)} {selectedAccount.balanceType}</span></div>
                        <div style={{ display: 'flex', gap: '8px' }}><button onClick={handleExportCSV}>CSV</button><button onClick={handleExportPDF}>Print</button><button onClick={() => setSelectedAccount(null)}>Close</button></div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                        <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                        <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                        <select value={filterType} onChange={e => setFilterType(e.target.value)}><option value="All">All</option><option value="Dr">Dr only</option><option value="Cr">Cr only</option></select>
                    </div>
                    <DataTable data={filteredTransactions} columns={txnColumns} recycleBinType="ledgerEntries" onFilteredDataChange={handleProcessedTransactions} />
                </div>
            )}
        </div>
    );
}
