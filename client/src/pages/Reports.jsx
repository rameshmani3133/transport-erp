import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

// --- Reusable KPI Components ---
const KpiCard = ({ title, value, color, subtitle }) => (
    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderLeft: `5px solid ${color}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '13px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>{title}</h3>
        <p style={{ margin: '10px 0', fontSize: '28px', color: '#1e293b', fontWeight: 'bold' }}>{value}</p>
        {subtitle && <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>{subtitle}</span>}
    </div>
);

const ReportSection = ({ title, children }) => (
    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#334155', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>{title}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            {children}
        </div>
    </div>
);

const StatRow = ({ label, value, valColor = '#1e293b' }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0' }}>
        <span style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>{label}</span>
        <span style={{ fontSize: '14px', color: valColor, fontWeight: 'bold' }}>{value}</span>
    </div>
);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[char]));

export default function Reports() {
    const [activeTab, setActiveTab] = useState('summary'); 
    
    const [tripFilters, setTripFilters] = useState({ clientId: '', routeLoc: '', startDate: '', endDate: '' });
    const [vehicleFilters, setVehicleFilters] = useState({ ownership: 'All', status: 'All' });
    const [auditFilters, setAuditFilters] = useState({ group: 'All' });

    const [data, setData] = useState({ trips: [], invoices: [], settlements: [], accounts: [], vehicles: [], clients: [], loading: true });

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [tRes, iRes, sRes, aRes, vRes, cRes] = await Promise.all([
                    fetch('/api/trips'), fetch('/api/invoices'), fetch('/api/settlements'),
                    fetch('/api/ledger/accounts'), fetch('/api/vehicles'), fetch('/api/companies')
                ]);

                setData({
                    trips: tRes.ok ? await tRes.json() : [],
                    invoices: iRes.ok ? await iRes.json() : [],
                    settlements: sRes.ok ? await sRes.json() : [],
                    accounts: aRes.ok ? await aRes.json() : [],
                    vehicles: vRes.ok ? await vRes.json() : [],
                    clients: cRes.ok ? await cRes.json() : [],
                    loading: false
                });
            } catch (error) { console.error(error); setData(prev => ({ ...prev, loading: false })); }
        };
        fetchAllData();
    }, []);

    if (data.loading) return <div style={{ padding: '40px', fontSize: '18px', fontWeight: 'bold' }}>Loading Reporting Engine...</div>;

    // ==========================================
    // 1. SUMMARY TAB MATH
    // ==========================================
    const totalInvoiced = data.invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
    const totalTax = data.invoices.reduce((sum, inv) => sum + (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0), 0);
    const debtors = data.accounts.filter(a => a.accountGroup?.includes('Sundry Debtors'));
    const totalReceivables = debtors.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
    const creditors = data.accounts.filter(a => a.accountGroup?.includes('Sundry Creditors'));
    const totalPayables = creditors.reduce((sum, a) => sum + Math.abs(a.currentBalance || 0), 0);
    const totalTrips = data.trips.length;
    const totalFreightGenerated = data.trips.reduce((sum, t) => sum + (t.totalClientBill || 0), 0);

    // ==========================================
    // 2. DATA GRIDS & EXPORT DEFINITIONS
    // ==========================================
    
    // A. Trips
    const filteredTrips = data.trips.filter(t => {
        if (tripFilters.clientId && t.companyId.toString() !== tripFilters.clientId) return false;
        if (tripFilters.startDate && new Date(t.date) < new Date(tripFilters.startDate)) return false;
        if (tripFilters.endDate && new Date(t.date) > new Date(tripFilters.endDate)) return false;
        if (tripFilters.routeLoc) {
            const loc = tripFilters.routeLoc.toLowerCase();
            const from = t.route?.fromLocation?.toLowerCase() || '';
            const to = t.route?.toLocation?.toLowerCase() || '';
            if (!from.includes(loc) && !to.includes(loc)) return false;
        }
        return true;
    });

    const tripCols = [
        { header: 'Trip No', key: 'tripNo', render: t => <strong>{t.tripNo}</strong>, exportValue: t => t.tripNo },
        { header: 'Date', key: 'date', render: t => new Date(t.date).toLocaleDateString(), exportValue: t => new Date(t.date).toLocaleDateString() },
        { header: 'Client', key: 'client', render: t => t.company?.companyName, exportValue: t => t.company?.companyName || '' },
        { header: 'Route', key: 'route', render: t => `${t.route?.fromLocation} ➔ ${t.route?.toLocation}`, exportValue: t => `${t.route?.fromLocation} - ${t.route?.toLocation}` },
        { header: 'Vehicle', key: 'vehicle', render: t => t.vehicle?.regNo, exportValue: t => t.vehicle?.regNo || '' },
        { header: 'Bill Wt.', key: 'wt', render: t => `${t.billWeight} T`, exportValue: t => t.billWeight },
        { header: 'Total Bill (₹)', key: 'bill', render: t => <strong style={{color:'#16a34a'}}>{t.totalClientBill?.toFixed(2)}</strong>, exportValue: t => t.totalClientBill?.toFixed(2) }
    ];

    // B. Vehicles
    const filteredVehicles = data.vehicles.filter(v => {
        if (vehicleFilters.ownership !== 'All' && v.ownershipType !== vehicleFilters.ownership) return false;
        if (vehicleFilters.status !== 'All' && v.status !== vehicleFilters.status) return false;
        return true;
    });

    const vehicleCols = [
        { header: 'Reg No', key: 'regNo', render: v => <strong>{v.regNo}</strong>, exportValue: v => v.regNo },
        { header: 'Ownership', key: 'own', render: v => v.ownershipType, exportValue: v => v.ownershipType },
        { header: 'Capacity', key: 'cap', render: v => `${v.capacityTon} T`, exportValue: v => v.capacityTon },
        { header: 'FC Expiry', key: 'fc', render: v => v.fcExpiry ? new Date(v.fcExpiry).toLocaleDateString() : '-', exportValue: v => v.fcExpiry ? new Date(v.fcExpiry).toLocaleDateString() : '' },
        { header: 'Permit Expiry', key: 'permit', render: v => v.permit1YrExpiry ? new Date(v.permit1YrExpiry).toLocaleDateString() : '-', exportValue: v => v.permit1YrExpiry ? new Date(v.permit1YrExpiry).toLocaleDateString() : '' },
        { header: 'Tax Expiry', key: 'tax', render: v => v.qTaxExpiry ? new Date(v.qTaxExpiry).toLocaleDateString() : '-', exportValue: v => v.qTaxExpiry ? new Date(v.qTaxExpiry).toLocaleDateString() : '' }
    ];

    // C. Audit
    const filteredAccounts = data.accounts.filter(a => {
        if (auditFilters.group !== 'All' && !a.accountGroup?.includes(auditFilters.group)) return false;
        return true;
    });

    const auditCols = [
        { header: 'Account Name', key: 'name', render: a => <strong>{a.accountName}</strong>, exportValue: a => a.accountName },
        { header: 'Group', key: 'group', render: a => a.accountGroup, exportValue: a => a.accountGroup },
        { header: 'Type', key: 'type', render: a => a.accountType, exportValue: a => a.accountType },
        { header: 'Opening Bal.', key: 'ob', render: a => `₹${a.openingBalance}`, exportValue: a => a.openingBalance },
        { header: 'Current Bal.', key: 'cb', render: a => (
            <span style={{ fontWeight: 'bold', color: a.balanceType === 'Dr' && a.currentBalance >= 0 ? '#16a34a' : (a.balanceType === 'Cr' && a.currentBalance >= 0 ? '#ea580c' : '#dc2626') }}>
                ₹{a.currentBalance?.toFixed(2)} {a.balanceType}
            </span>
        ), exportValue: a => `${a.currentBalance?.toFixed(2)} ${a.balanceType}` }
    ];

    // ==========================================
    // 3. EXPORT ENGINES
    // ==========================================

    const getActiveTableConfig = () => {
        if (activeTab === 'trips') return { data: filteredTrips, cols: tripCols, title: 'Trip_Report' };
        if (activeTab === 'vehicles') return { data: filteredVehicles, cols: vehicleCols, title: 'Vehicle_Asset_Report' };
        if (activeTab === 'audit') return { data: filteredAccounts, cols: auditCols, title: 'Ledger_Audit_Report' };
        return null;
    };

    const handleExportCSV = () => {
        const config = getActiveTableConfig();
        if (!config || config.data.length === 0) return alert("No data to export.");

        const headers = config.cols.map(c => `"${c.header}"`).join(',');
        const rows = config.data.map(row => 
            config.cols.map(c => {
                const val = c.exportValue(row) || '';
                return `"${String(val).replace(/"/g, '""')}"`; // Escape quotes for CSV
            }).join(',')
        );

        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${config.title}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportPDF = () => {
        const config = getActiveTableConfig();
        if (!config || config.data.length === 0) return alert("No data to print.");

        const printWindow = window.open('', '_blank');
        const html = `
            <html>
                <head>
                    <title>${escapeHtml(config.title.replace(/_/g, ' '))}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                        h2 { text-align: center; color: #1e293b; margin-bottom: 5px; }
                        p { text-align: center; color: #64748b; font-size: 12px; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; font-size: 12px; }
                        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
                        th { background-color: #f1f5f9; font-weight: bold; color: #334155; }
                    </style>
                </head>
                <body>
                    <h2>${escapeHtml(config.title.replace(/_/g, ' '))}</h2>
                    <p>Generated on: ${new Date().toLocaleString()}</p>
                    <table>
                        <thead>
                            <tr>${config.cols.map(c => `<th>${escapeHtml(c.header)}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${config.data.map(row => `<tr>${config.cols.map(c => `<td>${escapeHtml(c.exportValue(row))}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                    <script>
                        window.onload = () => { window.print(); window.close(); }
                    </script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <h2 style={{ color: '#1e293b', margin: 0 }}>Reporting Engine</h2>
                {activeTab !== 'summary' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleExportCSV} style={{ padding: '8px 16px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            📊 Export Excel (CSV)
                        </button>
                        <button onClick={handleExportPDF} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            🖨️ Print / Save PDF
                        </button>
                    </div>
                )}
            </div>

            {/* TAB NAVIGATION */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
                {['summary', 'trips', 'vehicles', 'audit'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{ 
                        padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', borderRadius: '6px', border: 'none',
                        backgroundColor: activeTab === tab ? '#1e293b' : 'transparent',
                        color: activeTab === tab ? 'white' : '#64748b'
                    }}>
                        {tab === 'summary' ? 'Executive Dashboard' : tab === 'trips' ? 'Trip Reports' : tab === 'vehicles' ? 'Vehicle & Asset Report' : 'Ledger & Audit'}
                    </button>
                ))}
            </div>

            {/* TAB 1: EXECUTIVE SUMMARY */}
            {activeTab === 'summary' && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                        <KpiCard title="Total Revenue (Invoiced)" value={`₹ ${totalInvoiced.toLocaleString('en-IN')}`} color="#3b82f6" subtitle={`${data.invoices.length} Total Invoices`} />
                        <KpiCard title="Total Receivables (Owed)" value={`₹ ${totalReceivables.toLocaleString('en-IN')}`} color="#10b981" subtitle="From Sundry Debtors" />
                        <KpiCard title="Total Payables (You Owe)" value={`₹ ${totalPayables.toLocaleString('en-IN')}`} color="#ef4444" subtitle="To Creditors & Vendors" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                        <ReportSection title="🚚 Operations Summary">
                            <StatRow label="Total Trips Dispatched" value={totalTrips} />
                            <StatRow label="Total Unbilled Freight" value={`₹ ${(totalFreightGenerated - totalInvoiced + totalTax).toLocaleString('en-IN')}`} valColor="#10b981" />
                        </ReportSection>
                        <ReportSection title="🏢 Asset & Accounts Summary">
                            <StatRow label="Total Client Profiles" value={debtors.length} />
                            <StatRow label="Total Vendor Profiles" value={creditors.length} />
                        </ReportSection>
                    </div>
                </div>
            )}

            {/* TAB 2: TRIP REPORTS */}
            {activeTab === 'trips' && (
                <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ flex: 1 }}><label style={{fontSize:'12px', fontWeight:'bold'}}>Client</label><select value={tripFilters.clientId} onChange={e => setTripFilters({...tripFilters, clientId: e.target.value})} style={{width:'100%', padding:'8px'}}><option value="">All Clients</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}</select></div>
                        <div style={{ flex: 1 }}><label style={{fontSize:'12px', fontWeight:'bold'}}>Location/Route</label><input type="text" placeholder="e.g. Mumbai" value={tripFilters.routeLoc} onChange={e => setTripFilters({...tripFilters, routeLoc: e.target.value})} style={{width:'100%', padding:'8px', border:'1px solid #cbd5e1', borderRadius:'4px'}} /></div>
                        <div style={{ flex: 1 }}><label style={{fontSize:'12px', fontWeight:'bold'}}>Start Date</label><input type="date" value={tripFilters.startDate} onChange={e => setTripFilters({...tripFilters, startDate: e.target.value})} style={{width:'100%', padding:'8px', border:'1px solid #cbd5e1', borderRadius:'4px'}} /></div>
                        <div style={{ flex: 1 }}><label style={{fontSize:'12px', fontWeight:'bold'}}>End Date</label><input type="date" value={tripFilters.endDate} onChange={e => setTripFilters({...tripFilters, endDate: e.target.value})} style={{width:'100%', padding:'8px', border:'1px solid #cbd5e1', borderRadius:'4px'}} /></div>
                    </div>
                    <DataTable data={filteredTrips} columns={tripCols} title="Operational Trips Report" />
                </div>
            )}

            {/* TAB 3: VEHICLE REPORTS */}
            {activeTab === 'vehicles' && (
                <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ flex: 1 }}><label style={{fontSize:'12px', fontWeight:'bold'}}>Ownership Type</label><select value={vehicleFilters.ownership} onChange={e => setVehicleFilters({...vehicleFilters, ownership: e.target.value})} style={{width:'100%', padding:'8px'}}><option value="All">All Vehicles</option><option value="Owned">Owned Only (Fleet)</option><option value="Market">Market Only (Attached)</option></select></div>
                        <div style={{ flex: 1 }}><label style={{fontSize:'12px', fontWeight:'bold'}}>Status</label><select value={vehicleFilters.status} onChange={e => setVehicleFilters({...vehicleFilters, status: e.target.value})} style={{width:'100%', padding:'8px'}}><option value="All">All Statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>
                    </div>
                    <DataTable data={filteredVehicles} columns={vehicleCols} title="Fleet & Asset Compliance Report" />
                </div>
            )}

            {/* TAB 4: AUDIT REPORTS */}
            {activeTab === 'audit' && (
                <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ flex: 1 }}><label style={{fontSize:'12px', fontWeight:'bold'}}>Account Group (Ledger Type)</label><select value={auditFilters.group} onChange={e => setAuditFilters({...auditFilters, group: e.target.value})} style={{width:'100%', padding:'8px'}}><option value="All">All Chart of Accounts</option><option value="Sundry Debtors">Sundry Debtors (Clients)</option><option value="Sundry Creditors">Sundry Creditors (Vendors/Pumps)</option><option value="Cash/Bank">Cash & Bank Accounts</option><option value="Income">Income Ledgers</option></select></div>
                    </div>
                    <DataTable data={filteredAccounts} columns={auditCols} title="Chart of Accounts & Ledger Balance Report" />
                </div>
            )}

        </div>
    );
}
