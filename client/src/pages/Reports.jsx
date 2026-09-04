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

function ExcelMultiFilter({ label, options, selected, onChange }) {
    const [search, setSearch] = useState('');
    const shown = options.filter(option => String(option || '').toLowerCase().includes(search.trim().toLowerCase()));
    const selectedSet = new Set(selected.map(String));
    const toggle = option => {
        const value = String(option);
        onChange(selectedSet.has(value) ? selected.filter(item => String(item) !== value) : [...selected, value]);
    };
    return (
        <details style={{ position: 'relative', minWidth: 0 }}>
            <summary style={{ listStyle: 'none', padding: '9px 10px', border: `1px solid ${selected.length ? '#2563eb' : '#cbd5e1'}`, borderRadius: '6px', background: selected.length ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}: {selected.length ? `${selected.length} selected` : 'All'} ▾
            </summary>
            <div style={{ position: 'absolute', zIndex: 30, top: '42px', left: 0, width: '260px', maxWidth: '85vw', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', background: 'white', boxShadow: '0 12px 30px rgba(15,23,42,.2)' }}>
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}...`} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '5px', marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '6px', marginBottom: '7px' }}>
                    <button type="button" onClick={() => onChange(options.map(String))}>Select all</button>
                    <button type="button" onClick={() => onChange([])}>Clear</button>
                </div>
                <div style={{ maxHeight: '220px', overflowY: 'auto', borderTop: '1px solid #e2e8f0' }}>
                    {shown.length ? shown.map(option => <label key={String(option)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 2px', fontSize: '12px' }}><input type="checkbox" checked={selectedSet.has(String(option))} onChange={() => toggle(option)} /><span>{option || '(Blank)'}</span></label>) : <div style={{ padding: '10px 2px', color: '#64748b', fontSize: '12px' }}>No matching values</div>}
                </div>
            </div>
        </details>
    );
}

function SortableReportTable({ rows, columns, title, tableTitle, exportExcel, exportCsv, printReport, defaultVisibleKeys }) {
    const [processedRows, setProcessedRows] = useState(rows);
    const columnSignature = columns.map(column => column.key).join('|');
    const defaults = defaultVisibleKeys?.length ? defaultVisibleKeys : columns.map(column => column.key);
    const [visibleKeys, setVisibleKeys] = useState(defaults);

    useEffect(() => {
        setProcessedRows(rows);
    }, [rows]);

    useEffect(() => {
        try {
            const stored = JSON.parse(localStorage.getItem(`report-columns:${title}`) || 'null');
            const valid = Array.isArray(stored) ? stored.filter(key => columns.some(column => column.key === key)) : [];
            setVisibleKeys(valid.length ? valid : defaults);
        } catch {
            setVisibleKeys(defaults);
        }
    }, [title, columnSignature]);

    const visibleColumns = columns.filter(column => visibleKeys.includes(column.key));
    const toggleColumn = key => {
        const next = visibleKeys.includes(key) ? visibleKeys.filter(item => item !== key) : [...visibleKeys, key];
        if (!next.length) return;
        setVisibleKeys(next);
        localStorage.setItem(`report-columns:${title}`, JSON.stringify(next));
    };
    const applyColumns = keys => {
        setVisibleKeys(keys);
        localStorage.setItem(`report-columns:${title}`, JSON.stringify(keys));
    };
    const totalColumns = visibleColumns.filter(column => column.total);
    const valueFor = (row, column) => column.exportValue ? column.exportValue(row) : row[column.key] ?? '';

    return (
        <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <button onClick={() => exportExcel(processedRows, visibleColumns, title)} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: '#0f766e', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Export Excel</button>
                <button onClick={() => exportCsv(processedRows, visibleColumns, title)} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: '#475569', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Export CSV</button>
                <button onClick={() => printReport(processedRows, visibleColumns, title)} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: '#2563eb', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Print Report</button>
                <details style={{ position: 'relative' }}>
                    <summary style={{ listStyle: 'none', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', color: '#334155', cursor: 'pointer', fontWeight: 800 }}>Columns ({visibleColumns.length}/{columns.length})</summary>
                    <div style={{ position: 'absolute', zIndex: 20, top: '42px', right: 0, width: '280px', maxHeight: '360px', overflowY: 'auto', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', background: 'white', boxShadow: '0 12px 30px rgba(15,23,42,.18)' }}>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '9px' }}><button type="button" onClick={() => applyColumns(columns.map(column => column.key))}>Show all</button><button type="button" onClick={() => applyColumns(defaults)}>Recommended</button></div>
                        {columns.map(column => <label key={column.key} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '5px 0', fontSize: '12px' }}><input type="checkbox" checked={visibleKeys.includes(column.key)} onChange={() => toggleColumn(column.key)} />{column.header}</label>)}
                    </div>
                </details>
            </div>
            {totalColumns.length > 0 && <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>{totalColumns.map(column => <div key={column.key} style={{ padding: '9px 12px', border: '1px solid #dbeafe', borderRadius: '7px', background: '#eff6ff' }}><span style={{ color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>{column.totalLabel || column.header}</span><div style={{ color: '#1d4ed8', fontWeight: 900 }}>{column.totalFormat === 'number' ? Number(processedRows.reduce((sum, row) => sum + Number(valueFor(row, column) || 0), 0)).toFixed(2) : money(processedRows.reduce((sum, row) => sum + Number(valueFor(row, column) || 0), 0))}</div></div>)}</div>}
            <DataTable data={rows} columns={visibleColumns} title={tableTitle || title.replace(/_/g, ' ')} enableColumnFilters onFilteredDataChange={setProcessedRows} />
        </>
    );
}

export default function Reports() {
    const [activeTab, setActiveTab] = useState('summary');
    const [tripReportView, setTripReportView] = useState('vendor');
    const [filters, setFilters] = useState({ clientId: '', startDate: '', endDate: '', group: 'All', loanPaymentStatus: 'All', loanStatus: 'All', voucherType: 'All', voucherStatus: 'All', vehicleId: '', ownershipType: 'All', partyName: '', tripStatus: 'All', invoiceState: 'All', settlementState: 'All', fromLocation: '', toLocation: '' });
    const [tripFilters, setTripFilters] = useState({ vehicleNo: [], ownershipType: [], partyName: [], fromLocation: [], toLocation: [], tripStatus: [], invoiceState: [], settlementState: [] });
    const [data, setData] = useState({ trips: [], tripReportRows: [], invoices: [], settlements: [], accounts: [], vehicles: [], clients: [], payments: [], loans: [], vouchers: [], loading: true });

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [tRes, trRes, iRes, sRes, aRes, vRes, cRes, pRes, lRes, voRes] = await Promise.all([
                    fetch('/api/trips'), fetch('/api/reports/trips'), fetch('/api/invoices'), fetch('/api/settlements'), fetch('/api/ledger/accounts'), fetch('/api/vehicles'), fetch('/api/companies'), fetch('/api/payments'), fetch('/api/loans'), fetch('/api/vouchers')
                ]);
                const tripReport = trRes.ok ? await trRes.json() : { rows: [] };
                setData({
                    trips: tRes.ok ? await tRes.json() : [],
                    tripReportRows: tripReport.rows || [],
                    invoices: iRes.ok ? await iRes.json() : [],
                    settlements: sRes.ok ? await sRes.json() : [],
                    accounts: aRes.ok ? await aRes.json() : [],
                    vehicles: vRes.ok ? await vRes.json() : [],
                    clients: cRes.ok ? await cRes.json() : [],
                    payments: pRes.ok ? await pRes.json() : [],
                    loans: lRes.ok ? await lRes.json() : [],
                    vouchers: voRes.ok ? await voRes.json() : [],
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

    const tripRowsForView = useMemo(() => data.tripReportRows.map(row => ({
        ...row,
        ...(row.views?.[tripReportView] || {}),
        invoiceState: row.invoiceNo ? 'Billed' : 'Unbilled',
        settlementState: row.settlementNo ? 'Settled' : 'Unsettled'
    })).filter(row => {
        if (filters.clientId && String(row.clientId) !== String(filters.clientId)) return false;
        if (filters.startDate && String(row.date).slice(0, 10) < filters.startDate) return false;
        if (filters.endDate && String(row.date).slice(0, 10) > filters.endDate) return false;
        if (tripReportView === 'vendor' && row.ownershipType !== 'Market') return false;
        if (tripReportView === 'own' && row.ownershipType === 'Market') return false;
        return true;
    }), [data.tripReportRows, filters.clientId, filters.startDate, filters.endDate, tripReportView]);

    const tripFilterKeys = ['vehicleNo', 'ownershipType', 'partyName', 'fromLocation', 'toLocation', 'tripStatus', 'invoiceState', 'settlementState'];
    const matchesTripSelections = (row, exceptKey = '') => tripFilterKeys.every(key => key === exceptKey || !tripFilters[key].length || tripFilters[key].includes(String(row[key] ?? '')));
    const detailedTripRows = useMemo(() => tripRowsForView.filter(row => matchesTripSelections(row)), [tripRowsForView, tripFilters]);
    const tripFilterOptions = useMemo(() => Object.fromEntries(tripFilterKeys.map(key => [key, [...new Set(tripRowsForView.filter(row => matchesTripSelections(row, key)).map(row => String(row[key] ?? '')))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))])), [tripRowsForView, tripFilters]);
    const updateTripFilter = (key, values) => setTripFilters(previous => ({ ...previous, [key]: values }));

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
        if (filters.loanPaymentStatus !== 'All' && (loan.paymentStatus || 'Due') !== filters.loanPaymentStatus) return false;
        if (filters.loanStatus !== 'All' && loan.status !== filters.loanStatus) return false;
        return true;
    }), [data.loans, filters]);
    const filteredVouchers = useMemo(() => data.vouchers.filter(voucher => {
        if (filters.startDate && new Date(voucher.date) < new Date(filters.startDate)) return false;
        if (filters.endDate && new Date(voucher.date) > new Date(filters.endDate)) return false;
        if (filters.voucherType !== 'All' && voucher.voucherType !== filters.voucherType) return false;
        if (filters.voucherStatus !== 'All' && voucher.status !== filters.voucherStatus) return false;
        return true;
    }), [data.vouchers, filters]);
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
        const totals = columns.some(column => column.total) ? `<tfoot><tr>${columns.map((column, index) => `<td>${column.total ? htmlEscape(rows.reduce((sum, row) => sum + Number(tableValue(row, column) || 0), 0).toFixed(2)) : index === 0 ? 'TOTAL' : ''}</td>`).join('')}</tr></tfoot>` : '';
        const html = `<html><head><meta charset="utf-8" /><style>.excel-text{mso-number-format:"\\@";}tfoot{font-weight:bold}</style></head><body><table border="1"><thead><tr>${columns.map(c => `<th>${htmlEscape(c.header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td${c.excelText ? ' class="excel-text"' : ''}>${htmlEscape(tableValue(row, c))}</td>`).join('')}</tr>`).join('')}</tbody>${totals}</table></body></html>`;
        downloadFile(html, 'application/vnd.ms-excel', `${title}_${today()}.xls`);
    };
    const exportCsv = (rows, columns, title) => {
        if (!rows.length) return alert('No data to export.');
        const csvCell = (value, forceText = false) => {
            const content = `${forceText && value !== '' ? '\t' : ''}${String(value ?? '')}`;
            return `"${content.replace(/"/g, '""')}"`;
        };
        const totalRow = columns.some(column => column.total) ? [columns.map((column, index) => csvCell(column.total ? rows.reduce((sum, row) => sum + Number(tableValue(row, column) || 0), 0).toFixed(2) : index === 0 ? 'TOTAL' : '')).join(',')] : [];
        const csv = [columns.map(column => csvCell(column.header)).join(','), ...rows.map(row => columns.map(column => csvCell(tableValue(row, column), column.excelText)).join(',')), ...totalRow].join('\r\n');
        downloadFile(`\ufeff${csv}`, 'text/csv;charset=utf-8', `${title}_${today()}.csv`);
    };
    const printReport = (rows, columns, title) => {
        if (!rows.length) return alert('No data to print.');
        const printWindow = window.open('', '_blank');
        const dense = columns.length > 10;
        const colgroup = `<colgroup>${columns.map(column => `<col${column.printWidth ? ` style="width:${column.printWidth}"` : ''}>`).join('')}</colgroup>`;
        const totals = columns.some(column => column.total) ? `<tfoot><tr>${columns.map((column, index) => `<td class="${column.align === 'right' ? 'number' : ''}">${column.total ? htmlEscape(column.totalFormat === 'number' ? rows.reduce((sum, row) => sum + Number(tableValue(row, column) || 0), 0).toFixed(2) : money(rows.reduce((sum, row) => sum + Number(tableValue(row, column) || 0), 0))) : index === 0 ? 'TOTAL' : ''}</td>`).join('')}</tr></tfoot>` : '';
        printWindow.document.write(`<html><head><title>${htmlEscape(title)}</title><style>@page{size:A4 landscape;margin:6mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:8px;color:#111827}h2{margin:0 0 3px;font-size:16px}p{color:#64748b;font-size:9px;margin:0 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${dense ? '7px' : '9px'}}thead{display:table-header-group}tfoot{display:table-row-group;font-weight:800;background:#f1f5f9}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #94a3b8;padding:${dense ? '2px 3px' : '4px'};text-align:left;vertical-align:middle;line-height:1.25;overflow-wrap:anywhere}th{background:#e2e8f0;color:#1e293b;font-weight:700}.nowrap{white-space:nowrap;overflow-wrap:normal}.number{text-align:right}@media print{body{padding:0}}</style></head><body><h2>${htmlEscape(title.replace(/_/g, ' '))}</h2><p>Generated on ${new Date().toLocaleString()}</p><table>${colgroup}<thead><tr>${columns.map(c => `<th class="${c.nowrap ? 'nowrap' : ''}">${htmlEscape(c.header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td class="${[c.nowrap ? 'nowrap' : '', c.align === 'right' ? 'number' : ''].filter(Boolean).join(' ')}">${htmlEscape(tableValue(row, c))}</td>`).join('')}</tr>`).join('')}</tbody>${totals}</table><script>window.onload=()=>window.print()</script></body></html>`);
        printWindow.document.close();
    };
    if (data.loading) return <div style={{ padding: '40px', fontWeight: 800 }}>Loading reports...</div>;

    const amountColumn = (header, key) => ({ header, key, render: row => money(row[key]), exportValue: row => row[key], total: true, align: 'right', nowrap: true });
    const numberColumn = (header, key) => ({ header, key, exportValue: row => row[key], total: true, totalFormat: 'number', align: 'right', nowrap: true });
    const tripCols = [
        { header: 'Movement No', key: 'movementNo', render: row => <strong>{row.movementNo}</strong>, exportValue: row => row.movementNo, excelText: true, nowrap: true },
        { header: 'Trip No', key: 'tripNo', excelText: true, nowrap: true },
        { header: 'Load Date', key: 'date', render: row => dateText(row.date), exportValue: row => dateText(row.date), nowrap: true },
        { header: 'Truck No', key: 'vehicleNo', excelText: true, nowrap: true },
        { header: 'From', key: 'fromLocation' }, { header: 'To', key: 'toLocation' },
        { header: 'Client', key: 'clientName' },
        { header: tripReportView === 'own' ? 'Driver / Party' : 'Party', key: 'partyName' },
        { header: 'Ownership', key: 'ownershipType' }, { header: 'Measurement', key: 'measurement', nowrap: true },
        numberColumn('Bill Weight', 'billWeight'), numberColumn('Guarantee Weight', 'guaranteeWeight'), numberColumn('Chargeable Weight', 'chargeableWeight'),
        { header: 'Rate Type', key: 'rateType' }, amountColumn('Rate', 'rate'), amountColumn('Basic Freight', 'basicFreight'),
        amountColumn('ODC / Extra Size', 'odcAmount'), numberColumn('Halt Days', 'haltingDays'), amountColumn('Halt Amount', 'haltingAmount'),
        amountColumn(tripReportView === 'client' ? 'Party Amount' : 'Gross Amount', 'grossAmount'), amountColumn('Advance', 'advance'),
        { header: 'Advance Date', key: 'advanceDate', render: row => dateText(row.advanceDate), exportValue: row => dateText(row.advanceDate), nowrap: true },
        amountColumn(tripReportView === 'own' ? 'Diesel Cost' : tripReportView === 'client' ? 'Client Diesel Adj.' : 'Diesel Recovery', 'dieselRecovery'),
        amountColumn('Commission', 'commission'), amountColumn('Trip Expenses', 'otherExpenses'), amountColumn('Other Deduction', 'otherDeduction'),
        amountColumn('Total Deductions', 'totalDeductions'), amountColumn(tripReportView === 'own' ? 'Operating Balance' : 'Balance Payable', 'balanceAmount'),
        { header: 'Invoice No', key: 'invoiceNo', excelText: true, nowrap: true }, { header: 'Invoice Status', key: 'invoiceStatus' },
        { header: 'Settlement No', key: 'settlementNo', excelText: true, nowrap: true }, { header: 'Settlement Status', key: 'settlementStatus' },
        { header: 'Trip Status', key: 'tripStatus' }, { header: 'Expense Description', key: 'expenseRemarks' }, { header: 'Remarks', key: 'remarks' }
    ];
    const tripDefaultColumns = {
        client: ['movementNo', 'vehicleNo', 'date', 'fromLocation', 'toLocation', 'partyName', 'measurement', 'billWeight', 'guaranteeWeight', 'rate', 'grossAmount', 'advance', 'advanceDate', 'dieselRecovery', 'totalDeductions', 'balanceAmount', 'invoiceNo'],
        vendor: ['movementNo', 'vehicleNo', 'date', 'fromLocation', 'toLocation', 'partyName', 'measurement', 'billWeight', 'guaranteeWeight', 'rate', 'grossAmount', 'advance', 'advanceDate', 'haltingDays', 'haltingAmount', 'dieselRecovery', 'commission', 'otherDeduction', 'totalDeductions', 'balanceAmount'],
        own: ['movementNo', 'vehicleNo', 'date', 'fromLocation', 'toLocation', 'clientName', 'partyName', 'billWeight', 'rate', 'grossAmount', 'advance', 'dieselRecovery', 'otherExpenses', 'totalDeductions', 'balanceAmount']
    }[tripReportView];
    const invoiceCols = [
        { header: 'Invoice', key: 'invoiceNo', render: inv => <strong>{inv.invoiceNo}</strong>, exportValue: inv => inv.invoiceNo },
        { header: 'Client', key: 'location.company.companyName', render: inv => inv.location?.company?.companyName, exportValue: inv => inv.location?.company?.companyName || '' },
        { header: 'Date', key: 'date', render: inv => dateText(inv.date), exportValue: inv => dateText(inv.date) },
        { header: 'Total', key: 'grandTotal', render: inv => money(inv.grandTotal), exportValue: inv => inv.grandTotal, total: true },
        { header: 'Paid/Advance', key: 'totalPaid', render: inv => money(inv.totalPaid), exportValue: inv => inv.totalPaid, total: true },
        { header: 'Balance', key: 'balanceAmount', render: inv => <strong style={{ color: inv.balanceAmount > 0 ? '#b45309' : '#0f766e' }}>{money(inv.balanceAmount)}</strong>, exportValue: inv => inv.balanceAmount, total: true },
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
        { header: 'Trips', key: 'trips', exportValue: c => c.trips, total: true, totalFormat: 'number' },
        { header: 'Invoiced', key: 'invoiced', render: c => money(c.invoiced), exportValue: c => c.invoiced, total: true },
        { header: 'Outstanding', key: 'outstanding', render: c => <strong>{money(c.outstanding)}</strong>, exportValue: c => c.outstanding, total: true }
    ];
    const loanCols = [
        { header: 'Loan No', key: 'loanNo', render: loan => <strong>{loan.loanNo || '-'}</strong>, exportValue: loan => loan.loanNo || '', excelText: true, printWidth: '7%', nowrap: true },
        { header: 'Bank / Finance', key: 'lenderName', render: loan => loan.lenderName, exportValue: loan => loan.lenderName, printWidth: '10%' },
        { header: 'Provider Bank', key: 'lenderBankName', render: loan => loan.lenderBankName || '-', exportValue: loan => loan.lenderBankName || '', printWidth: '8%' },
        { header: 'Account No', key: 'lenderAccountNo', render: loan => loan.lenderAccountNo || '-', exportValue: loan => String(loan.lenderAccountNo || ''), excelText: true, printWidth: '11%', nowrap: true },
        { header: 'IFSC', key: 'lenderIfscCode', render: loan => loan.lenderIfscCode || '-', exportValue: loan => loan.lenderIfscCode || '', excelText: true, printWidth: '8%', nowrap: true },
        { header: 'Vehicle', key: 'vehicle.regNo', render: loan => loan.vehicle?.regNo || '-', exportValue: loan => loan.vehicle?.regNo || '', excelText: true, printWidth: '7%', nowrap: true },
        { header: 'Loan Amount', key: 'principalAmount', render: loan => money(loan.principalAmount), exportValue: loan => loan.principalAmount, printWidth: '8%', align: 'right', nowrap: true, total: true },
        { header: 'Outstanding', key: 'outstandingAmount', render: loan => <strong>{money(loan.outstandingAmount)}</strong>, exportValue: loan => loan.outstandingAmount, printWidth: '8%', align: 'right', nowrap: true, total: true },
        { header: 'EMI', key: 'emiAmount', render: loan => money(loan.emiAmount), exportValue: loan => loan.emiAmount, printWidth: '7%', align: 'right', nowrap: true, total: true },
        { header: 'Monthly Due Date', key: 'nextDueDate', render: loan => dateText(loan.nextDueDate), exportValue: loan => dateText(loan.nextDueDate), printWidth: '7%', nowrap: true },
        { header: 'Paid Date', key: 'paidDate', render: loan => dateText(loan.paidDate), exportValue: loan => dateText(loan.paidDate), printWidth: '7%', nowrap: true },
        { header: 'Payment Status', key: 'paymentStatus', render: loan => loan.paymentStatus || 'Due', exportValue: loan => loan.paymentStatus || 'Due' },
        { header: 'Loan Status', key: 'status', render: loan => loan.status, exportValue: loan => loan.status },
        { header: 'Remarks', key: 'remarks', render: loan => loan.remarks || '-', exportValue: loan => loan.remarks || '' }
    ];
    const voucherCols = [
        { header: 'Voucher', key: 'voucherNo', render: voucher => <strong>{voucher.voucherNo}</strong>, exportValue: voucher => voucher.voucherNo },
        { header: 'Date', key: 'date', render: voucher => dateText(voucher.date), exportValue: voucher => dateText(voucher.date) },
        { header: 'Type', key: 'voucherType', render: voucher => voucher.voucherType.replace(/_/g, ' '), exportValue: voucher => voucher.voucherType.replace(/_/g, ' ') },
        { header: 'Debit Account(s)', key: 'debitAccounts', filterValue: voucher => voucher.lines?.filter(line => line.type === 'Dr').map(line => line.account?.accountName).join(', ') || '', render: voucher => voucher.lines?.filter(line => line.type === 'Dr').map(line => line.account?.accountName).join(', ') || '-', exportValue: voucher => voucher.lines?.filter(line => line.type === 'Dr').map(line => line.account?.accountName).join(', ') || '' },
        { header: 'Credit Account(s)', key: 'creditAccounts', filterValue: voucher => voucher.lines?.filter(line => line.type === 'Cr').map(line => line.account?.accountName).join(', ') || '', render: voucher => voucher.lines?.filter(line => line.type === 'Cr').map(line => line.account?.accountName).join(', ') || '-', exportValue: voucher => voucher.lines?.filter(line => line.type === 'Cr').map(line => line.account?.accountName).join(', ') || '' },
        { header: 'Amount', key: 'totalAmount', render: voucher => <strong>{money(voucher.totalAmount)}</strong>, exportValue: voucher => voucher.totalAmount, total: true },
        { header: 'Mode', key: 'paymentMode', render: voucher => voucher.paymentMode || '-', exportValue: voucher => voucher.paymentMode || '' },
        { header: 'Reference', key: 'referenceNo', render: voucher => voucher.referenceNo || '-', exportValue: voucher => voucher.referenceNo || '' },
        { header: 'Narration', key: 'narration', render: voucher => voucher.narration, exportValue: voucher => voucher.narration },
        { header: 'Remarks', key: 'remarks', render: voucher => voucher.remarks || '-', exportValue: voucher => voucher.remarks || '' },
        { header: 'Status', key: 'status', exportValue: voucher => voucher.status }
    ];

    return (
        <div style={{ padding: '22px', maxWidth: '1500px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
                <div><h2 style={{ margin: 0, color: '#0f172a' }}>Reports Dashboard</h2><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Ledger-backed finance, collections, trip margin, diesel mapping, and account audit.</p></div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{['summary', 'trips', 'invoices', 'clients', 'loans', 'vouchers', 'accounts'].map(tab => <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', cursor: 'pointer', fontWeight: 800, background: activeTab === tab ? '#0f172a' : 'white', color: activeTab === tab ? 'white' : '#475569' }}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                <select value={filters.clientId} onChange={e => setFilters({ ...filters, clientId: e.target.value })} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}><option value="">All clients</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}</select>
                <input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                <input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                <button onClick={() => { setFilters({ clientId: '', startDate: '', endDate: '', group: 'All', loanPaymentStatus: 'All', loanStatus: 'All', voucherType: 'All', voucherStatus: 'All', vehicleId: '', ownershipType: 'All', partyName: '', tripStatus: 'All', invoiceState: 'All', settlementState: 'All', fromLocation: '', toLocation: '' }); setTripFilters({ vehicleNo: [], ownershipType: [], partyName: [], fromLocation: [], toLocation: [], tripStatus: [], invoiceState: [], settlementState: [] }); }} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: 'pointer', fontWeight: 800 }}>Clear</button>
            </div>
            {activeTab === 'trips' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '10px', margin: '-6px 0 14px', padding: '12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <select value={tripReportView} onChange={e => setTripReportView(e.target.value)}><option value="vendor">Vendor / Market Settlement</option><option value="client">Client Trip Statement</option><option value="own">Own Vehicle Performance</option></select>
                <ExcelMultiFilter label="Vehicle" options={tripFilterOptions.vehicleNo} selected={tripFilters.vehicleNo} onChange={values => updateTripFilter('vehicleNo', values)} />
                <ExcelMultiFilter label="Ownership" options={tripFilterOptions.ownershipType} selected={tripFilters.ownershipType} onChange={values => updateTripFilter('ownershipType', values)} />
                <ExcelMultiFilter label={tripReportView === 'own' ? 'Driver / Party' : 'Party'} options={tripFilterOptions.partyName} selected={tripFilters.partyName} onChange={values => updateTripFilter('partyName', values)} />
                <ExcelMultiFilter label="From" options={tripFilterOptions.fromLocation} selected={tripFilters.fromLocation} onChange={values => updateTripFilter('fromLocation', values)} />
                <ExcelMultiFilter label="To" options={tripFilterOptions.toLocation} selected={tripFilters.toLocation} onChange={values => updateTripFilter('toLocation', values)} />
                <ExcelMultiFilter label="Trip Status" options={tripFilterOptions.tripStatus} selected={tripFilters.tripStatus} onChange={values => updateTripFilter('tripStatus', values)} />
                <ExcelMultiFilter label="Billing" options={tripFilterOptions.invoiceState} selected={tripFilters.invoiceState} onChange={values => updateTripFilter('invoiceState', values)} />
                <ExcelMultiFilter label="Settlement" options={tripFilterOptions.settlementState} selected={tripFilters.settlementState} onChange={values => updateTripFilter('settlementState', values)} />
            </div>}
            {activeTab === 'loans' && <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '-6px 0 14px' }}>
                <select value={filters.loanPaymentStatus} onChange={e => setFilters({ ...filters, loanPaymentStatus: e.target.value })} style={{ padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px' }}><option value="All">All payment statuses</option><option value="Due">Due</option><option value="Paid">Paid</option><option value="Part Paid">Part Paid</option><option value="Overdue">Overdue</option><option value="Skipped">Skipped</option></select>
                <select value={filters.loanStatus} onChange={e => setFilters({ ...filters, loanStatus: e.target.value })} style={{ padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px' }}><option value="All">All loan statuses</option><option value="Active">Active</option><option value="On Hold">On Hold</option><option value="Closed">Closed</option></select>
            </div>}
            {activeTab === 'vouchers' && <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '-6px 0 14px' }}>
                <select value={filters.voucherType} onChange={e => setFilters({ ...filters, voucherType: e.target.value })} style={{ padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px' }}><option value="All">All voucher types</option>{[...new Set(data.vouchers.map(voucher => voucher.voucherType))].sort().map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}</select>
                <select value={filters.voucherStatus} onChange={e => setFilters({ ...filters, voucherStatus: e.target.value })} style={{ padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px' }}><option value="All">All voucher statuses</option><option value="Posted">Posted</option><option value="Reversed">Reversed</option></select>
            </div>}
            {activeTab === 'summary' && <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '18px' }}><StatCard label="Ledger Revenue" value={money(revenue)} tone="#2563eb" sub="Income ledger balance" /><StatCard label="Ledger Expenses" value={money(expenses)} tone="#dc2626" sub="Expense ledger balance" /><StatCard label="Gross Profit" value={money(grossProfit)} tone={grossProfit >= 0 ? '#0f766e' : '#dc2626'} sub={`Margin ${pct(margin)}`} /><StatCard label="Receivables" value={money(receivables)} tone="#b45309" sub="Open client ledger balance" /><StatCard label="Payables" value={money(payables)} tone="#7c3aed" sub="Vendor and pump creditors" /><StatCard label="Loan Outstanding" value={money(loanOutstanding)} tone="#9333ea" sub={`${dueLoans.length} loans not marked paid`} /><StatCard label="Monthly EMI" value={money(loanMonthlyEmi)} tone="#0f766e" sub="Active loan cash outflow" /><StatCard label="Diesel Control" value={money(dieselControl)} tone="#0f766e" sub="Client/vendor diesel subledgers" /><StatCard label="Output Tax" value={money(taxPayable)} tone="#475569" sub="Duties & Taxes" /></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}><Section title="Collections Snapshot"><Bar label="Invoiced" value={invoiced} max={Math.max(invoiced, collected, 1)} color="#2563eb" /><Bar label="Collected incl. advances" value={collected} max={Math.max(invoiced, collected, 1)} color="#0f766e" /><Bar label="Unbilled trips" value={unbilled} max={Math.max(invoiced, unbilled, 1)} color="#b45309" /></Section><Section title="Loan Snapshot"><Bar label="Principal" value={loanPrincipal} max={Math.max(loanPrincipal, loanOutstanding, 1)} color="#7c3aed" /><Bar label="Outstanding" value={loanOutstanding} max={Math.max(loanPrincipal, loanOutstanding, 1)} color="#b45309" /><Bar label="Monthly EMI" value={loanMonthlyEmi} max={Math.max(loanPrincipal, loanMonthlyEmi, 1)} color="#0f766e" /></Section><Section title="Receivable Aging">{Object.entries(aging).map(([label, value]) => <Bar key={label} label={label} value={value} max={agingMax} color={label === '90+' ? '#dc2626' : '#0f766e'} />)}</Section><Section title="Top Client Outstanding">{clientRows.slice(0, 5).map(c => <Bar key={c.id} label={c.name} value={c.outstanding} max={Math.max(clientRows[0]?.outstanding || 1, 1)} color="#7c3aed" />)}</Section></div></>}
            {activeTab === 'trips' && <SortableReportTable rows={detailedTripRows} columns={tripCols} title={`Detailed_Trip_${tripReportView}_Report`} tableTitle={`${tripReportView === 'vendor' ? 'Vendor / Market Settlement' : tripReportView === 'client' ? 'Client Trip Statement' : 'Own Vehicle Performance'} (${detailedTripRows.length})`} defaultVisibleKeys={tripDefaultColumns} exportExcel={exportExcel} exportCsv={exportCsv} printReport={printReport} />}
            {activeTab === 'invoices' && <SortableReportTable rows={filteredInvoices} columns={invoiceCols} title="Invoice_Collections_Report" tableTitle="Invoice Collections" exportExcel={exportExcel} exportCsv={exportCsv} printReport={printReport} />}
            {activeTab === 'clients' && <SortableReportTable rows={clientRows} columns={clientCols} title="Client_Performance_Report" tableTitle="Client Performance" exportExcel={exportExcel} exportCsv={exportCsv} printReport={printReport} />}
            {activeTab === 'loans' && <SortableReportTable rows={filteredLoans} columns={loanCols} title="Loan_Tracking_Report" tableTitle="Loan Tracking" exportExcel={exportExcel} exportCsv={exportCsv} printReport={printReport} />}
            {activeTab === 'vouchers' && <SortableReportTable rows={filteredVouchers} columns={voucherCols} title="Voucher_Register_Report" tableTitle="Voucher Register" exportExcel={exportExcel} exportCsv={exportCsv} printReport={printReport} />}
            {activeTab === 'accounts' && <><div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}><select value={filters.group} onChange={e => setFilters({ ...filters, group: e.target.value })}><option value="All">All groups</option><option value="Sundry Debtors">Sundry Debtors</option><option value="Sundry Creditors">Sundry Creditors</option><option value="Cash/Bank">Cash/Bank</option><option value="Direct Income">Income</option><option value="Expense">Expense</option><option value="Duties & Taxes">Duties & Taxes</option><option value="Client Diesel">Client Diesel</option><option value="Vendor Diesel">Vendor Diesel</option></select></div><SortableReportTable rows={filteredAccounts} columns={accountCols} title="Ledger_Audit_Report" tableTitle="Ledger Account Audit" exportExcel={exportExcel} exportCsv={exportCsv} printReport={printReport} /></>}
        </div>
    );
}
