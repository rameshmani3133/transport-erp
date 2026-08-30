import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

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
    const [editId, setEditId] = useState(null);

    // Filter States
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterType, setFilterType] = useState('All'); // All, Dr, Cr

    const initialEntry = { 
        accountId: '', type: 'Dr', amount: '', narration: '', 
        date: new Date().toISOString().split('T')[0] 
    };
    const [manualEntry, setManualEntry] = useState(initialEntry);

    const fetchAccounts = async () => {
        try {
            const res = await fetch('/api/ledger/accounts');
            if (res.ok) setAccounts(await res.json());
        } catch (err) { console.error(err); }
    };

    useEffect(() => { fetchAccounts(); }, []);

    const viewStatement = async (accountId) => {
        try {
            const acc = accounts.find(a => a.id === accountId);
            setSelectedAccount(acc);
            const res = await fetch(`/api/ledger/transactions/${accountId}`);
            if (res.ok) setTransactions(await res.json());
        } catch (error) { console.error(error); }
    };

    const handleManualSubmit = async (e) => {
        e.preventDefault();
        try {
            const method = editId ? 'PUT' : 'POST';
            const url = editId ? `/api/ledger/manual/${editId}` : '/api/ledger/manual';
            
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(manualEntry)
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save entry");
            
            alert(editId ? "Entry Updated!" : "Entry Posted Successfully!");
            setManualEntry(initialEntry);
            setEditId(null);
            fetchAccounts();
            
            if (selectedAccount && manualEntry.accountId === selectedAccount.id.toString()) {
                viewStatement(selectedAccount.id);
            }
        } catch (error) { alert(error.message); }
    };

    const handleEdit = (txn) => {
        setEditId(txn.id);
        setManualEntry({
            accountId: txn.accountId.toString(),
            type: txn.type,
            amount: txn.amount,
            narration: txn.narration,
            date: new Date(txn.date).toISOString().split('T')[0]
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (!(await window.confirmSnackbar("Are you sure you want to delete this manual entry?"))) return;
        try {
            const res = await fetch(`/api/ledger/manual/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to delete");
            
            fetchAccounts();
            if (selectedAccount) viewStatement(selectedAccount.id);
        } catch (error) { alert(error.message); }
    };

    // Apply Statement Filters
    const filteredTransactions = transactions.filter(t => {
        if (filterStartDate && new Date(t.date) < new Date(filterStartDate)) return false;
        if (filterEndDate && new Date(t.date) > new Date(filterEndDate)) return false;
        if (filterType !== 'All' && t.type !== filterType) return false;
        return true;
    });

    // ==========================================
    // EXPORT ENGINES
    // ==========================================
    const handleExportCSV = () => {
        if (!filteredTransactions || filteredTransactions.length === 0) return alert("No transactions to export.");

        const headers = ["Date", "Narration", "Reference", "Debit (Dr)", "Credit (Cr)"];
        const rows = filteredTransactions.map(t => {
            const date = new Date(t.date).toLocaleDateString();
            const narration = (t.narration || '').replace(/"/g, '""'); // Escape quotes for CSV
            const ref = t.trip?.tripNo || t.invoice?.invoiceNo || t.settlement?.settlementNo || 'Manual Voucher';
            const dr = t.type === 'Dr' ? t.amount.toFixed(2) : '';
            const cr = t.type === 'Cr' ? t.amount.toFixed(2) : '';
            return `"${date}","${narration}","${ref}","${dr}","${cr}"`;
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${selectedAccount.accountName.replace(/\s+/g, '_')}_Statement_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportPDF = () => {
        if (!filteredTransactions || filteredTransactions.length === 0) return alert("No transactions to print.");

        const printWindow = window.open('', '_blank');
        const html = `
            <html>
                <head>
                    <title>${selectedAccount.accountName} - Ledger Statement</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                        h2 { text-align: center; color: #1e293b; margin-bottom: 5px; text-transform: uppercase; }
                        p { text-align: center; color: #64748b; font-size: 13px; margin-bottom: 30px; }
                        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 25px; }
                        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
                        th { background-color: #f1f5f9; font-weight: bold; color: #334155; }
                        .text-right { text-align: right; }
                        .summary { float: right; border: 2px solid #1e293b; padding: 15px; border-radius: 6px; font-size: 15px; font-weight: bold; background-color: #f8fafc; }
                    </style>
                </head>
                <body>
                    <h2>${selectedAccount.accountName}</h2>
                    <p>
                        <strong>Account Group:</strong> ${selectedAccount.accountGroup} <br/>
                        <strong>Statement Date:</strong> ${new Date().toLocaleString()}
                    </p>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Narration</th>
                                <th>Reference</th>
                                <th class="text-right">Debit (Dr)</th>
                                <th class="text-right">Credit (Cr)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredTransactions.map(t => `
                                <tr>
                                    <td>${new Date(t.date).toLocaleDateString()}</td>
                                    <td>${escapeHtml(t.narration || '-')}</td>
                                    <td>${escapeHtml(t.trip?.tripNo || t.invoice?.invoiceNo || t.settlement?.settlementNo || 'Manual Voucher')}</td>
                                    <td class="text-right" style="color: #16a34a; font-weight: bold;">${t.type === 'Dr' ? t.amount.toFixed(2) : '-'}</td>
                                    <td class="text-right" style="color: #ea580c; font-weight: bold;">${t.type === 'Cr' ? t.amount.toFixed(2) : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="summary">
                        Current Final Balance: ₹${selectedAccount.currentBalance?.toFixed(2)} ${selectedAccount.balanceType}
                    </div>
                    <script>
                        window.onload = () => { window.print(); window.close(); }
                    </script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    // ==========================================
    // TABLE COLUMNS
    // ==========================================
    const accountColumns = [
        { header: 'Account Name', key: 'accountName', render: (a) => <strong>{a.accountName}</strong> },
        { header: 'Group', key: 'accountGroup', render: (a) => a.accountGroup },
        { header: 'Current Balance', key: 'currentBalance', render: (a) => (
            <span style={{ fontWeight: 'bold', color: a.balanceType === 'Dr' && a.currentBalance >= 0 ? '#16a34a' : (a.balanceType === 'Cr' && a.currentBalance >= 0 ? '#ea580c' : '#dc2626') }}>
                ₹{a.currentBalance?.toFixed(2)} {a.balanceType}
            </span>
        )},
        { header: 'Actions', key: 'actions', render: (a) => (
            <button onClick={() => viewStatement(a.id)} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>View Statement</button>
        )}
    ];

    const txnColumns = [
        { header: 'Date', key: 'date', render: (t) => new Date(t.date).toLocaleDateString() },
        { header: 'Narration', key: 'narration', render: (t) => t.narration || '-' },
        { header: 'Reference', key: 'ref', render: (t) => {
            if (t.trip?.tripNo) return <span style={{color: '#64748b'}}>Trip: {t.trip.tripNo}</span>;
            if (t.invoice?.invoiceNo) return <span style={{color: '#64748b'}}>Inv: {t.invoice.invoiceNo}</span>;
            if (t.settlement?.settlementNo) return <span style={{color: '#64748b'}}>Set: {t.settlement.settlementNo}</span>;
            return <span style={{fontWeight: 'bold', color: '#8b5cf6'}}>Manual Voucher</span>;
        }},
        { header: 'Debit (Dr)', key: 'debit', render: (t) => t.type === 'Dr' ? <span style={{color: '#16a34a', fontWeight: 'bold'}}>₹{t.amount.toFixed(2)}</span> : '-' },
        { header: 'Credit (Cr)', key: 'credit', render: (t) => t.type === 'Cr' ? <span style={{color: '#ea580c', fontWeight: 'bold'}}>₹{t.amount.toFixed(2)}</span> : '-' },
        { header: 'Actions', key: 'actions', render: (t) => {
            const isManual = !t.tripId && !t.invoiceId && !t.settlementId && !t.dieselId;
            if (!isManual) return <span style={{fontSize: '11px', color: '#94a3b8'}}>Auto-System</span>;
            return (
                <div style={{display: 'flex', gap: '8px'}}>
                    <button onClick={() => handleEdit(t)} style={{background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold'}}>Edit</button>
                    <button onClick={() => handleDelete(t.id)} style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold'}}>Del</button>
                </div>
            );
        }}
    ];

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>General Ledger Dashboard</h2>

            {/* Direct Manual Entry Form */}
            <form onSubmit={handleManualSubmit} style={{ backgroundColor: editId ? '#fffbeb' : '#f8fafc', padding: '20px', borderRadius: '12px', border: editId ? '2px solid #f59e0b' : '1px solid #cbd5e1', marginBottom: '25px', display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: editId ? '#d97706' : '#475569' }}>
                        {editId ? "Editing Account" : "Select Account (Pump/Driver/Vendor)"}
                    </label>
                    <select value={manualEntry.accountId} onChange={(e) => setManualEntry({...manualEntry, accountId: e.target.value})} required style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                        <option value="">-- Choose Account --</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.accountName} ({a.accountGroup})</option>)}
                    </select>
                </div>

                <div style={{ flex: '0 1 120px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Date</label>
                    <input type="date" required value={manualEntry.date} onChange={(e) => setManualEntry({...manualEntry, date: e.target.value})} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>

                <div style={{ flex: '0 1 100px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Type</label>
                    <select value={manualEntry.type} onChange={(e) => setManualEntry({...manualEntry, type: e.target.value})} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                        <option value="Dr">Debit (Dr)</option>
                        <option value="Cr">Credit (Cr)</option>
                    </select>
                </div>

                <div style={{ flex: '0 1 150px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Amount (₹)</label>
                    <input type="number" step="any" required value={manualEntry.amount} onChange={(e) => setManualEntry({...manualEntry, amount: e.target.value})} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>

                <div style={{ flex: '2 1 200px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Narration</label>
                    <input type="text" required value={manualEntry.narration} onChange={(e) => setManualEntry({...manualEntry, narration: e.target.value})} placeholder="e.g. Pump Payment, Driver Cash Return" style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    {editId && (
                        <button type="button" onClick={() => { setEditId(null); setManualEntry(initialEntry); }} style={{ padding: '9px 18px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                    )}
                    <button type="submit" style={{ padding: '9px 18px', backgroundColor: editId ? '#f59e0b' : '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                        {editId ? 'Update Entry' : 'Post Entry'}
                    </button>
                </div>
            </form>

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <DataTable data={accounts} columns={accountColumns} title="Chart of Accounts Balances" />
            </div>

            {selectedAccount && (
                <div style={{ marginTop: '40px', padding: '25px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '2px solid #cbd5e1' }}>
                    
                    {/* Header with Export Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px' }}>Statement: {selectedAccount.accountName}</h3>
                            <span style={{ fontSize: '13px', color: '#64748b' }}>Current Balance: <strong style={{ color: '#0f172a' }}>₹{selectedAccount.currentBalance?.toFixed(2)} {selectedAccount.balanceType}</strong></span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleExportCSV} style={{ padding: '8px 16px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                📊 Excel (CSV)
                            </button>
                            <button onClick={handleExportPDF} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                🖨️ PDF / Print
                            </button>
                            <button onClick={() => setSelectedAccount(null)} style={{ padding: '8px 16px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                Close
                            </button>
                        </div>
                    </div>

                    {/* Filters for Statement */}
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Start Date</label>
                            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>End Date</label>
                            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Entry Type</label>
                            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                                <option value="All">All Entries</option>
                                <option value="Dr">Debit (Dr) Only</option>
                                <option value="Cr">Credit (Cr) Only</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); setFilterType('All'); }} style={{ padding: '7px 12px', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Clear Filters</button>
                        </div>
                    </div>

                    <DataTable data={filteredTransactions} columns={txnColumns} />
                </div>
            )}
        </div>
    );
}   
