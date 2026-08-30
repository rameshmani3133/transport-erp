import React, { useState, useEffect } from 'react';

export default function AccountMaster() {
    const [accounts, setAccounts] = useState([]);
    const [editId, setEditId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const initialState = {
        accountName: '',
        accountType: 'Asset',
        accountGroup: 'Cash/Bank',
        openingBalance: 0,
        balanceType: 'Dr'
    };
    const [formData, setFormData] = useState(initialState);

    // Dynamic Account Groups based on standard accounting rules
    const groupOptions = {
        'Asset': ['Cash/Bank', 'Sundry Debtors (Clients)', 'Loans & Advances (Asset)', 'Fixed Assets'],
        'Liability': ['Sundry Creditors (Vendors)', 'Sundry Creditors (Fuel Pump)', 'Duties & Taxes', 'Loans (Liability)'],
        'Income': ['Direct Income (Freight)', 'Indirect Income'],
        'Expense': ['Direct Expense (Diesel/Tolls)', 'Indirect Expense (Office/Admin)']
    };

    const fetchAccounts = async () => {
        try {
            const res = await fetch('/api/ledger/accounts');
            if (res.ok) setAccounts(await res.json());
        } catch (error) { console.error(error); }
    };

    useEffect(() => { fetchAccounts(); }, []);

    // Auto-switch balance type based on Account Type (Standard Accounting Math)
    const handleTypeChange = (e) => {
        const newType = e.target.value;
        const defaultGroup = groupOptions[newType][0];
        const defaultBalType = (newType === 'Asset' || newType === 'Expense') ? 'Dr' : 'Cr';
        
        setFormData({
            ...formData, 
            accountType: newType, 
            accountGroup: defaultGroup,
            balanceType: defaultBalType
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const method = editId ? 'PUT' : 'POST';
            const url = editId ? `/api/ledger/account/${editId}` : '/api/ledger/account';
            
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save account");
            
            alert(`Account ${editId ? 'Updated' : 'Created'} Successfully!`);
            setFormData(initialState);
            setEditId(null);
            fetchAccounts();
        } catch (error) { alert(error.message); }
    };

    const handleEdit = (acc) => {
        setEditId(acc.id);
        setFormData({
            accountName: acc.accountName,
            accountType: acc.accountType,
            accountGroup: acc.accountGroup,
            openingBalance: acc.openingBalance,
            balanceType: acc.balanceType
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (!(await window.confirmSnackbar("Delete this Account? If there are active ledger transactions tied to it, the system will block the deletion to protect your math integrity."))) return;
        
        try {
            const res = await fetch(`/api/ledger/account/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            fetchAccounts();
        } catch (error) { alert(error.message); }
    };

    // --- DATA GROUPING ENGINE ---
    const filteredAccounts = accounts.filter(a => a.accountName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Group accounts by their Account Group for organized viewing
    const groupedAccounts = filteredAccounts.reduce((acc, current) => {
        const group = current.accountGroup || 'Uncategorized';
        if (!acc[group]) acc[group] = [];
        acc[group].push(current);
        return acc;
    }, {});

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Account Master (Chart of Accounts)</h2>

            <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Account Name (Pump/Driver/Vendor)</label>
                        <input type="text" required value={formData.accountName} onChange={(e) => setFormData({...formData, accountName: e.target.value})} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Account Type</label>
                        <select required value={formData.accountType} onChange={handleTypeChange} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                            <option value="Asset">Asset (Cash, Debtors)</option>
                            <option value="Liability">Liability (Payables, Loans)</option>
                            <option value="Income">Income (Revenue)</option>
                            <option value="Expense">Expense (Costs)</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Account Group</label>
                        <select required value={formData.accountGroup} onChange={(e) => setFormData({...formData, accountGroup: e.target.value})} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                            {groupOptions[formData.accountType].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Opening Balance (₹)</label>
                        <input type="number" step="any" required value={formData.openingBalance} onChange={(e) => setFormData({...formData, openingBalance: e.target.value})} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Balance Type (Dr/Cr)</label>
                        <select required value={formData.balanceType} onChange={(e) => setFormData({...formData, balanceType: e.target.value})} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                            <option value="Dr">Debit (Dr)</option>
                            <option value="Cr">Credit (Cr)</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    {editId && <button type="button" onClick={() => { setEditId(null); setFormData(initialState); }} style={{ padding: '10px 20px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel Edit</button>}
                    <button type="submit" style={{ padding: '10px 20px', backgroundColor: editId ? '#f59e0b' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        {editId ? 'Update Ledger Account' : 'Save New Account'}
                    </button>
                </div>
            </form>

            <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, color: '#334155' }}>Grouped Chart of Accounts</h3>
                    <input 
                        type="text" 
                        placeholder="Search accounts..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', width: '250px' }} 
                    />
                </div>

                {Object.keys(groupedAccounts).length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>No accounts found.</p>
                ) : (
                    Object.keys(groupedAccounts).map(groupName => (
                        <div key={groupName} style={{ marginBottom: '30px' }}>
                            <h4 style={{ margin: '0 0 10px 0', padding: '8px 12px', backgroundColor: '#f1f5f9', color: '#1e293b', borderRadius: '6px', fontSize: '14px', borderLeft: '4px solid #3b82f6' }}>
                                {groupName} <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 'normal' }}>({groupedAccounts[groupName].length} Accounts)</span>
                            </h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                                        <th style={{ padding: '10px' }}>Account Name</th>
                                        <th style={{ padding: '10px' }}>Type</th>
                                        <th style={{ padding: '10px', textAlign: 'right' }}>Opening Balance</th>
                                        <th style={{ padding: '10px', textAlign: 'right' }}>Live Current Balance</th>
                                        <th style={{ padding: '10px', textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedAccounts[groupName].map(acc => (
                                        <tr key={acc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px', fontWeight: 'bold', color: '#1e293b' }}>{acc.accountName}</td>
                                            <td style={{ padding: '10px' }}>
                                                <span style={{ 
                                                    padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold',
                                                    backgroundColor: acc.accountType === 'Asset' ? '#dcfce7' : acc.accountType === 'Liability' ? '#fee2e2' : '#fef3c7',
                                                    color: acc.accountType === 'Asset' ? '#166534' : acc.accountType === 'Liability' ? '#991b1b' : '#b45309'
                                                }}>
                                                    {acc.accountType}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>
                                                ₹{acc.openingBalance.toFixed(2)} {acc.balanceType}
                                            </td>
                                            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>
                                                <span style={{ color: acc.balanceType === 'Dr' && acc.currentBalance >= 0 ? '#16a34a' : (acc.balanceType === 'Cr' && acc.currentBalance >= 0 ? '#ea580c' : '#dc2626') }}>
                                                    ₹{(acc.currentBalance ?? acc.openingBalance).toFixed(2)} {acc.balanceType}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                <button onClick={() => handleEdit(acc)} style={{ marginRight: '10px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Edit</button>
                                                <button onClick={() => handleDelete(acc.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Del</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}