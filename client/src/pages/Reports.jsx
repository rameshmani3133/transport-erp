import React, { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';

const money = (value) => `Rs.${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
const today = () => new Date().toISOString().split('T')[0];
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-';
const htmlEscape = (value) => String(value ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));

const StatCard = ({ label, value, tone = '#2563eb', sub }) => (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px', boxShadow: '0 10px 28px rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: '26px', color: tone, fontWeight: 900, marginTop: '8px' }}>{value}</div>
        {sub && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>{sub}</div>}
    </div>
);

const Section = ({ title, children }) => (
    <section style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px', boxShadow: '0 10px 28px rgba(15,23,42,0.06)' }}>
        <h3 style={{ margin: '0 0 14px', color: '#0f172a', fontSize: '16px' }}>{title}</h3>
        {children}
    </section>
);

const Bar = ({ label, value, max, color }) => (
    <div style={{ display: 'grid', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', fontWeight: 700 }}><span>{label}</span><span>{money(value)}</span></div>
        <div style={{ height: '9px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, height: '100%', background: color }} />
        </div>
    </div>
);

export default function Reports() {
    const [activeTab, setActiveTab] = useState('summary');
    const [filters, setFilters] = useState({ clientId: '', startDate: '', endDate: '', group: 'All' });
    const [data, setData] = useState({ trips: [], invoices: [], settlements: [], accounts: [], vehicles: [], clients: [], payments: [], loans: [], loading: true });

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [tRes, iRes, sRes, aRes, vRes, cRes, pRes, lRes] = await Promise.all([
                    fetch('/api/trips'), fetch('/api/invoices'), fetch('/api/settlements'), fetch('/api/ledger/accounts'), fetch('/api/vehicles'), fetch('/api/companies'), fetch('/api/payments'), fetch('/api/loans')
                ]);
                setData({
                    trips: tRes.ok ? await tRes.json() : [],
                    invoices: iRes.ok ? await iRes.json() : [],
                    settlements: sRes.ok ? await sRes.json() : [],
                    accounts: aRes.ok ? await aRes.json() : [],
                    vehicles: vRes.ok ? await vRes.json() : [],
                    clients: cRes.ok ? await cRes.json() : [],
                    payments: pRes.ok ? await pRes.json() : [],
                    loans: lRes.ok ? await lRes.json() : [],
                    loading: false
                });
            } catch (error) {
                console.error(error);
                setData(prev => ({ ...prev, loading: false }));
            }
        };
        fetchAllData();
    }, []);

    const filteredTrips = useMemo(() => data.trips.filter(t => {
        if (filters.clientId && String(t.companyId) !== String(filters.clientId)) return false;
        if (filters.startDate && new Date(t.date) < new Date(filters.startDate)) return false;
        if (filters.endDate && new Date(t.date) > new Date(filters.endDate)) return false;
        return true;
    }), [data.trips, filters]);

    const filteredInvoices = useMemo(() => data.invoices.filter(inv => {
        if (filters.startDate && new Date(inv.date) < new Date(filters.startDate)) return false;
        if (filters.endDate && new Date(inv.date) > new Date(filters.endDate)) return false;
        if (filters.clientId && String(inv.location?.company?.id) !== String(filters.clientId)) return false;
        return true;
    }), [data.invoices, filters]);

    const filteredAccounts = data.accounts.filter(a => filters.group === 'All' || a.accountGroup?.includes(filters.group));
    const filteredLoans = useMemo(() => data.loans.filter(loan => {
        if (filters.startDate && new Date(loan.nextDueDate) < new Date(filters.startDate)) return false;
        if (filters.endDate && new Date(loan.nextDueDate) > new Date(filters.endDate)) return false;
        return true;
    }), [data.loans, filters]);
    const incomeAccounts = data.accounts.filter(a => a.accountType === 'Income');
    const expenseAccounts = data.accounts.filter(a => a.accountType === 'Expense');
    const debtorAccounts = data.accounts.filter(a => a.accountGroup?.includes('Sundry Debtors'));
    const creditorAccounts = data.accounts.filter(a => a.accountGroup?.includes('Sundry Creditors'));

    const revenue = incomeAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);
    const expenses = expenseAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);
    const receivables = debtorAccounts.reduce((sum, a) => sum + Math.max(0, Number(a.currentBalance || 0)), 0);
    const payables = creditorAccounts.reduce((sum, a) => sum + Math.max(0, Number(a.currentBalance || 0)), 0);
    const taxPayable = data.accounts.filter(a => a.accountGroup === 'Duties & Taxes').reduce((sum, a) => sum + Math.max(0, Number(a.currentBalance || 0)), 0);
    const dieselControl = data.accounts.filter(a => a.accountGroup?.includes('Diesel')).reduce((sum, a) => sum + Math.abs(Number(a.currentBalance || 0)), 0);
    const activeLoans = data.loans.filter(loan => loan.status === 'Active');
    const loanPrincipal = activeLoans.reduce((sum, loan) => sum + Number(loan.principalAmount || 0), 0);
    const loanOutstanding = activeLoans.reduce((sum, loan) => sum + Number(loan.outstandingAmount || 0), 0);
    const loanMonthlyEmi = activeLoans.reduce((sum, loan) => sum + Number(loan.emiAmount || 0), 0);
    const dueLoans = activeLoans.filter(loan => loan.paymentStatus !== 'Paid');
    const invoiced = filteredInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0);
    const collected = filteredInvoices.reduce((sum, inv) => sum + Number(inv.totalPaid || 0), 0);
    const unbilled = filteredTrips.filter(t => !t.invoiceId).reduce((sum, t) => sum + Number(t.totalClientBill || 0), 0);
    const grossProfit = revenue - expenses;
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const aging = filteredInvoices.filter(inv => inv.status !== 'Paid').reduce((acc, inv) => {
        const due = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.date);
        const days = Math.max(0, Math.floor((new Date() - due) / 86400000));
        const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
        acc[bucket] += Number(inv.balanceAmount || 0);
        return acc;
    }, { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 });
    const agingMax = Math.max(...Object.values(aging), 1);

    const tripRows = filteredTrips.map(t => ({
        ...t,
        grossMargin: Number(t.totalClientBill || 0) - Number(t.netTruckPayout || 0),
        marginPct: Number(t.totalClientBill || 0) > 0 ? ((Number(t.totalClientBill || 0) - Number(t.netTruckPayout || 0)) / Number(t.totalClientBill || 0)) * 100 : 0
    }));

    const clientRows = data.clients.map(client => {
        const invoices = data.invoices.filter(inv => inv.location?.company?.id === client.id);
        const trips = data.trips.filter(t => t.companyId === client.id);
        const account = debtorAccounts.find(a => a.clientId === client.id);
        return { id: client.id, name: client.companyName, trips: trips.length, invoiced: invoices.reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0), outstanding: Math.max(0, Number(account?.currentBalance || 0)) };
    }).sort((a, b) => b.outstanding - a.outstanding);

    const tableValue = (row, column) => column.exportValue ? column.exportValue(row) : row[column.key] ?? '';
    const downloadFile = (content, mimeType, fileName) => {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
    };
    const exportExcel = (rows, columns, title) => {
        if (!rows.length) return alert('No data to export.');
        const html = `<html><head><meta charset="utf-8" /></head><body><table border="1"><thead><tr>${columns.map(c => `<th>${htmlEscape(c.header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td>${htmlEscape(tableValue(row, c))}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
        downloadFile(html, 'application/vnd.ms-excel', `${title}_${today()}.xls`);
    };
    const printReport = (rows, columns, title) => {
        if (!rows.length) return alert('No data to print.');
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<html><head><title>${htmlEscape(title)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;padding:12px;color:#111827}h2{margin:0 0 4px;font-size:18px}p{color:#64748b;font-size:11px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:10px;table-layout:auto}th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top;word-break:break-word}th{background:#f1f5f9;color:#334155}@media print{body{padding:0}}</style></head><body><h2>${htmlEscape(title.replace(/_/g, ' '))}</h2><p>Generated on ${new Date().toLocaleString()}</p><table><thead><tr>${columns.map(c => `<th>${htmlEscape(c.header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td>${htmlEscape(tableValue(row, c))}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
        printWindow.document.close();
    };
    const ExportButtons = ({ rows, columns, title }) => (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => exportExcel(rows, columns, title)} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: '#0f766e', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Export Excel</button>
            <button onClick={() => printReport(rows, columns, title)} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: '#2563eb', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Print Report</button>
        </div>
    );

    if (data.loading) return <div style={{ padding: '40px', fontWeight: 800 }}>Loading reports...</div>;

    const tripCols = [
        { header: 'Trip', key: 'tripNo', render: t => <strong>{t.tripNo}</strong>, exportValue: t => t.tripNo },
        { header: 'Date', key: 'date', render: t => dateText(t.date), exportValue: t => dateText(t.date) },
        { header: 'Client', key: 'company.companyName', render: t => t.company?.companyName, exportValue: t => t.company?.companyName || '' },
        { header: 'Vehicle', key: 'vehicle.regNo', render: t => t.vehicle?.regNo, exportValue: t => t.vehicle?.regNo || '' },
        { header: 'Revenue', key: 'totalClientBill', render: t => money(t.totalClientBill), exportValue: t => t.totalClientBill },
        { header: 'Vendor Cost', key: 'netTruckPayout', render: t => money(t.netTruckPayout), exportValue: t => t.netTruckPayout },
        { header: 'Client Diesel', key: 'dieselAmount', render: t => money(t.dieselAmount), exportValue: t => t.dieselAmount },
        { header: 'Margin', key: 'grossMargin', render: t => <strong style={{ color: t.grossMargin >= 0 ? '#0f766e' : '#dc2626' }}>{money(t.grossMargin)} ({pct(t.marginPct)})</strong>, exportValue: t => t.grossMargin }
    ];
    const invoiceCols = [
        { header: 'Invoice', key: 'invoiceNo', render: inv => <strong>{inv.invoiceNo}</strong>, exportValue: inv => inv.invoiceNo },
        { header: 'Client', key: 'location.company.companyName', render: inv => inv.location?.company?.companyName, exportValue: inv => inv.location?.company?.companyName || '' },
        { header: 'Date', key: 'date', render: inv => dateText(inv.date), exportValue: inv => dateText(inv.date) },
        { header: 'Total', key: 'grandTotal', render: inv => money(inv.grandTotal), exportValue: inv => inv.grandTotal },
        { header: 'Paid/Advance', key: 'totalPaid', render: inv => money(inv.totalPaid), exportValue: inv => inv.totalPaid },
        { header: 'Balance', key: 'balanceAmount', render: inv => <strong style={{ color: inv.balanceAmount > 0 ? '#b45309' : '#0f766e' }}>{money(inv.balanceAmount)}</strong>, exportValue: inv => inv.balanceAmount },
        { header: 'Status', key: 'status', render: inv => inv.status, exportValue: inv => inv.status }
    ];
    const accountCols = [
        { header: 'Account', key: 'accountName', render: a => <strong>{a.accountName}</strong>, exportValue: a => a.accountName },
        { header: 'Type', key: 'accountType', exportValue: a => a.accountType },
        { header: 'Group', key: 'accountGroup', exportValue: a => a.accountGroup },
        { header: 'Balance', key: 'currentBalance', render: a => <strong>{money(a.currentBalance)} {a.balanceType}</strong>, exportValue: a => `${a.currentBalance} ${a.balanceType}` }
    ];
    const clientCols = [
        { header: 'Client', key: 'name', render: c => <strong>{c.name}</strong>, exportValue: c => c.name },
        { header: 'Trips', key: 'trips', exportValue: c => c.trips },
        { header: 'Invoiced', key: 'invoiced', render: c => money(c.invoiced), exportValue: c => c.invoiced },
        { header: 'Outstanding', key: 'outstanding', render: c => <strong>{money(c.outstanding)}</strong>, exportValue: c => c.outstanding }
    ];
    const loanCols = [
        { header: 'Loan No', key: 'loanNo', render: loan => <strong>{loan.loanNo || '-'}</strong>, exportValue: loan => loan.loanNo || '' },
        { header: 'Bank / Finance', key: 'lenderName', render: loan => loan.lenderName, exportValue: loan => loan.lenderName },
        { header: 'Provider Bank', key: 'lenderBankName', render: loan => loan.lenderBankName || '-', exportValue: loan => loan.lenderBankName || '' },
        { header: 'Account No', key: 'lenderAccountNo', render: loan => loan.lenderAccountNo || '-', exportValue: loan => loan.lenderAccountNo || '' },
        { header: 'IFSC', key: 'lenderIfscCode', render: loan => loan.lenderIfscCode || '-', exportValue: loan => loan.lenderIfscCode || '' },
        { header: 'Vehicle', key: 'vehicle.regNo', render: loan => loan.vehicle?.regNo || '-', exportValue: loan => loan.vehicle?.regNo || '' },
        { header: 'Loan Amount', key: 'principalAmount', render: loan => money(loan.principalAmount), exportValue: loan => loan.principalAmount },
        { header: 'Outstanding', key: 'outstandingAmount', render: loan => <strong>{money(loan.outstandingAmount)}</strong>, exportValue: loan => loan.outstandingAmount },
        { header: 'EMI', key: 'emiAmount', render: loan => money(loan.emiAmount), exportValue: loan => loan.emiAmount },
        { header: 'Monthly Due Date', key: 'nextDueDate', render: loan => dateText(loan.nextDueDate), exportValue: loan => dateText(loan.nextDueDate) },
        { header: 'Payment Status', key: 'paymentStatus', render: loan => loan.paymentStatus || 'Due', exportValue: loan => loan.paymentStatus || 'Due' },
        { header: 'Loan Status', key: 'status', render: loan => loan.status, exportValue: loan => loan.status }
    ];

    return (
        <div style={{ padding: '22px', maxWidth: '1500px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
                <div><h2 style={{ margin: 0, color: '#0f172a' }}>Reports Dashboard</h2><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Ledger-backed finance, collections, trip margin, diesel mapping, and account audit.</p></div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{['summary', 'trips', 'invoices', 'clients', 'loans', 'accounts'].map(tab => <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', cursor: 'pointer', fontWeight: 800, background: activeTab === tab ? '#0f172a' : 'white', color: activeTab === tab ? 'white' : '#475569' }}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                <select value={filters.clientId} onChange={e => setFilters({ ...filters, clientId: e.target.value })} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}><option value="">All clients</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}</select>
                <input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                <input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                <button onClick={() => setFilters({ clientId: '', startDate: '', endDate: '', group: 'All' })} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: 'pointer', fontWeight: 800 }}>Clear</button>
            </div>
            {activeTab === 'summary' && <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '18px' }}><StatCard label="Ledger Revenue" value={money(revenue)} tone="#2563eb" sub="Income ledger balance" /><StatCard label="Ledger Expenses" value={money(expenses)} tone="#dc2626" sub="Expense ledger balance" /><StatCard label="Gross Profit" value={money(grossProfit)} tone={grossProfit >= 0 ? '#0f766e' : '#dc2626'} sub={`Margin ${pct(margin)}`} /><StatCard label="Receivables" value={money(receivables)} tone="#b45309" sub="Open client ledger balance" /><StatCard label="Payables" value={money(payables)} tone="#7c3aed" sub="Vendor and pump creditors" /><StatCard label="Loan Outstanding" value={money(loanOutstanding)} tone="#9333ea" sub={`${dueLoans.length} loans not marked paid`} /><StatCard label="Monthly EMI" value={money(loanMonthlyEmi)} tone="#0f766e" sub="Active loan cash outflow" /><StatCard label="Diesel Control" value={money(dieselControl)} tone="#0f766e" sub="Client/vendor diesel subledgers" /><StatCard label="Output Tax" value={money(taxPayable)} tone="#475569" sub="Duties & Taxes" /></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}><Section title="Collections Snapshot"><Bar label="Invoiced" value={invoiced} max={Math.max(invoiced, collected, 1)} color="#2563eb" /><Bar label="Collected incl. advances" value={collected} max={Math.max(invoiced, collected, 1)} color="#0f766e" /><Bar label="Unbilled trips" value={unbilled} max={Math.max(invoiced, unbilled, 1)} color="#b45309" /></Section><Section title="Loan Snapshot"><Bar label="Principal" value={loanPrincipal} max={Math.max(loanPrincipal, loanOutstanding, 1)} color="#7c3aed" /><Bar label="Outstanding" value={loanOutstanding} max={Math.max(loanPrincipal, loanOutstanding, 1)} color="#b45309" /><Bar label="Monthly EMI" value={loanMonthlyEmi} max={Math.max(loanPrincipal, loanMonthlyEmi, 1)} color="#0f766e" /></Section><Section title="Receivable Aging">{Object.entries(aging).map(([label, value]) => <Bar key={label} label={label} value={value} max={agingMax} color={label === '90+' ? '#dc2626' : '#0f766e'} />)}</Section><Section title="Top Client Outstanding">{clientRows.slice(0, 5).map(c => <Bar key={c.id} label={c.name} value={c.outstanding} max={Math.max(clientRows[0]?.outstanding || 1, 1)} color="#7c3aed" />)}</Section></div></>}
            {activeTab === 'trips' && <><ExportButtons rows={tripRows} columns={tripCols} title="Trip_Margin_Report" /><DataTable data={tripRows} columns={tripCols} title="Trip Profitability" enableColumnFilters /></>}
            {activeTab === 'invoices' && <><ExportButtons rows={filteredInvoices} columns={invoiceCols} title="Invoice_Collections_Report" /><DataTable data={filteredInvoices} columns={invoiceCols} title="Invoice Collections" enableColumnFilters /></>}
            {activeTab === 'clients' && <><ExportButtons rows={clientRows} columns={clientCols} title="Client_Performance_Report" /><DataTable data={clientRows} columns={clientCols} title="Client Performance" enableColumnFilters /></>}
            {activeTab === 'loans' && <><ExportButtons rows={filteredLoans} columns={loanCols} title="Loan_Tracking_Report" /><DataTable data={filteredLoans} columns={loanCols} title="Loan Tracking" enableColumnFilters /></>}
            {activeTab === 'accounts' && <><div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}><select value={filters.group} onChange={e => setFilters({ ...filters, group: e.target.value })}><option value="All">All groups</option><option value="Sundry Debtors">Sundry Debtors</option><option value="Sundry Creditors">Sundry Creditors</option><option value="Cash/Bank">Cash/Bank</option><option value="Direct Income">Income</option><option value="Expense">Expense</option><option value="Duties & Taxes">Duties & Taxes</option><option value="Client Diesel">Client Diesel</option><option value="Vendor Diesel">Vendor Diesel</option></select></div><ExportButtons rows={filteredAccounts} columns={accountCols} title="Ledger_Audit_Report" /><DataTable data={filteredAccounts} columns={accountCols} title="Ledger Account Audit" enableColumnFilters /></>}
        </div>
    );
}
