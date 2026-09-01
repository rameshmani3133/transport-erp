import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

const num = (value) => Number(value || 0);
const money = (value) => `Rs.${num(value).toFixed(2)}`;
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-';

export default function VendorSettlement() {
    const [settlements, setSettlements] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [allUnsettledTrips, setAllUnsettledTrips] = useState([]);
    const [selectedVendorId, setSelectedVendorId] = useState('');
    const [selectedTripIds, setSelectedTripIds] = useState([]);

    const initialState = {
        date: new Date().toISOString().split('T')[0],
        totalFreight: 0, totalHalting: 0, totalExtraSize: 0, grossAmount: 0,
        totalAdvances: 0, totalCommission: 0, otherDeductions: 0, netPayable: 0
    };
    const [formData, setFormData] = useState(initialState);

    const fetchData = async () => {
        try {
            const [setRes, vehRes, tripRes, accRes] = await Promise.all([
                fetch('/api/settlements'), fetch('/api/vehicles'), fetch('/api/trips'), fetch('/api/ledger/accounts')
            ]);
            
            if (setRes.ok) setSettlements(await setRes.json());
            if (vehRes.ok) setVehicles(await vehRes.json());
            if (accRes.ok) setAccounts(await accRes.json());
            if (tripRes.ok) {
                const trips = await tripRes.json();
                setAllUnsettledTrips(trips.filter(t => !t.settlementId && t.status !== 'Cancelled'));
            }
        } catch (err) { console.error(err); }
    };

    useEffect(() => { fetchData(); }, []);

    // 1. Identify which Ledger Accounts are actual Vendors (have vehicles attached)
    const vendorAccounts = accounts.filter(a => vehicles.some(v => v.vendorAccountId === a.id));

    // 2. Filter unsettled trips to match ONLY the selected Vendor Account
    const displayTrips = allUnsettledTrips.filter(t => t.vehicle?.vendorAccountId?.toString() === selectedVendorId);
    
    // 3. Group those trips visually by Vehicle Registration Number
    const groupedTrips = displayTrips.reduce((acc, t) => {
        const vNo = t.vehicle?.regNo || 'Unknown Vehicle';
        if (!acc[vNo]) acc[vNo] = [];
        acc[vNo].push(t);
        return acc;
    }, {});

    const allDisplayedSelected = displayTrips.length > 0 && displayTrips.every(t => selectedTripIds.includes(t.id));

    // MATH ENGINE: Auto-Calculates Settlement Amounts when Trips are selected
    useEffect(() => {
        const selectedTrips = allUnsettledTrips.filter(t => selectedTripIds.includes(t.id));
        
        let freight = 0, halting = 0, extraSize = 0, advances = 0, gross = 0, autoCommission = 0;

        selectedTrips.forEach(t => {
            const halt = num(t.vendorHaltingCharge);
            const odc = num(t.vendorExtraSizeCharge);
            const totalTripPayout = num(t.netTruckPayout);
            
            halting += halt;
            extraSize += odc;
            freight += (totalTripPayout - halt - odc);
            gross += totalTripPayout;
            
            advances += num(t.advancePaid) + num(t.dieselAmount);
            autoCommission += num(t.commission);
        });

        // Use autoCommission from trips unless user overrides it
        const finalCommission = autoCommission || parseFloat(formData.totalCommission) || 0;
        const other = parseFloat(formData.otherDeductions) || 0;
        const net = gross - advances - finalCommission - other;

        setFormData(prev => ({
            ...prev,
            totalFreight: freight,
            totalHalting: halting,
            totalExtraSize: extraSize,
            grossAmount: gross,
            totalAdvances: advances,
            totalCommission: autoCommission, // Automatically fills the input
            netPayable: net
        }));
    }, [selectedTripIds, formData.otherDeductions, allUnsettledTrips]);

    const handleSelectAll = (e) => {
        if (e.target.checked) setSelectedTripIds(displayTrips.map(t => t.id));
        else setSelectedTripIds([]);
    };

    const handleTripToggle = (tripId) => {
        setSelectedTripIds(prev => prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]);
    };

    const handleVendorChange = (e) => {
        setSelectedVendorId(e.target.value);
        setSelectedTripIds([]); // Reset selections when switching vendor
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedVendorId) return alert("Please select a vendor.");
        if (selectedTripIds.length === 0) return alert("Please select at least one trip to settle.");

        try {
            const res = await fetch('/api/settlements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, vendorId: selectedVendorId, tripIds: selectedTripIds })
            });
            if (!res.ok) throw new Error("Failed to generate settlement.");
            
            alert("Settlement Generated Successfully!");
            setFormData(initialState);
            setSelectedVendorId('');
            setSelectedTripIds([]);
            fetchData();
        } catch (error) { alert(error.message); }
    };

    const handleDelete = async (id) => {
        if (!(await window.confirmSnackbar("Delete this settlement? The trips will become unsettled again and ledger entries will be removed."))) return;
        await fetch(`/api/settlements/${id}`, { method: 'DELETE' });
        fetchData();
    };

    const columns = [
        { header: 'Settlement No', key: 'settlementNo', render: s => <strong>{s.settlementNo}</strong> },
        { header: 'Date', key: 'date', render: s => dateText(s.date) },
        { header: 'Vendor / Owner', key: 'vendor', sortValue: s => s.vendor?.accountName || '', render: s => s.vendor?.accountName || '-' },
        { header: 'Gross Amount', key: 'grossAmount', render: s => money(s.grossAmount) },
        { header: 'Net Payable', key: 'netPayable', render: s => <span style={{color:'#16a34a', fontWeight:'bold'}}>{money(s.netPayable)}</span> },
        { header: 'Status', key: 'status', render: s => <span style={{backgroundColor:'#dcfce7', color:'#16a34a', padding:'4px 8px', borderRadius:'4px', fontSize:'12px', fontWeight:'bold'}}>{s.status}</span> },
        { header: 'Actions', key: 'actions', render: s => (
            <button onClick={() => handleDelete(s.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Delete</button>
        )}
    ];

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Vendor & Truck Settlements</h2>

            <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
                
                {/* 1. SELECTION AREA */}
                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>1. Select Vendor / Transporter</label>
                        <select value={selectedVendorId} onChange={handleVendorChange} required style={{ padding: '10px', borderRadius: '6px', border: '2px solid #cbd5e1', fontSize:'14px' }}>
                            <option value="">-- Choose Vendor --</option>
                            {vendorAccounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Settlement Date</label>
                        <input type="date" name="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize:'14px' }} />
                    </div>
                </div>

                {/* 2. TRIPS TABLE (GROUPED BY VEHICLE) */}
                <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>2. Select Unsettled Trips</h3>
                
                <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '25px', backgroundColor: '#f8fafc' }}>
                    {displayTrips.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px 0' }}>
                            {selectedVendorId ? "No unsettled trips found for this vendor's vehicles." : "Select a vendor above to load trips."}
                        </p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'white' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                                    <th style={{ padding: '10px' }}><input type="checkbox" checked={allDisplayedSelected} onChange={handleSelectAll} style={{cursor:'pointer'}} /></th>
                                    <th style={{ padding: '10px' }}>Trip No</th>
                                    <th style={{ padding: '10px' }}>Date</th>
                                    <th style={{ padding: '10px' }}>Route</th>
                                    <th style={{ padding: '10px', color: '#ef4444' }}>Advance (Rs.)</th>
                                    <th style={{ padding: '10px', color: '#f59e0b' }}>Comm. (Rs.)</th>
                                    <th style={{ padding: '10px', textAlign: 'right', color: '#16a34a' }}>Gross Payout (Rs.)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(groupedTrips).map(([vehicleReg, trips]) => (
                                    <React.Fragment key={vehicleReg}>
                                        <tr style={{ backgroundColor: '#e2e8f0', color: '#1e293b' }}>
                                            <td colSpan="7" style={{ padding: '8px 10px', fontWeight: 'bold' }}>Vehicle: {vehicleReg}</td>
                                        </tr>
                                        {trips.map(t => (
                                            <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: selectedTripIds.includes(t.id) ? '#f0f9ff' : 'white' }}>
                                                <td style={{ padding: '10px' }}><input type="checkbox" checked={selectedTripIds.includes(t.id)} onChange={() => handleTripToggle(t.id)} style={{cursor:'pointer'}} /></td>
                                                <td style={{ padding: '10px', fontWeight: 'bold' }}>{t.tripNo}</td>
                                                <td style={{ padding: '10px' }}>{dateText(t.date)}</td>
                                                <td style={{ padding: '10px' }}>{t.route?.toLocation}</td>
                                                <td style={{ padding: '10px', color: '#ef4444' }}>{money(num(t.advancePaid) + num(t.dieselAmount))}</td>
                                                <td style={{ padding: '10px', color: '#f59e0b', fontWeight: 'bold' }}>{money(t.commission)}</td>
                                                <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>{money(t.netTruckPayout)}</td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* 3. CALCULATIONS & DEDUCTIONS */}
                <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>3. Deductions & Final Payout</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '25px' }}>
                    
                    {/* Earned Block */}
                    <div style={{ backgroundColor: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#166534', textTransform: 'uppercase' }}>Gross Earnings</h4>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px' }}><span>Base Freight:</span> <strong>{money(formData.totalFreight)}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px' }}><span>Halting:</span> <strong>{money(formData.totalHalting)}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}><span>ODC/Extra Size:</span> <strong>{money(formData.totalExtraSize)}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #86efac', paddingTop: '5px', fontSize: '14px' }}><span>Total Gross:</span> <strong style={{color:'#15803d'}}>{money(formData.grossAmount)}</strong></div>
                    </div>

                    {/* Deductions Block */}
                    <div style={{ backgroundColor: '#fef2f2', padding: '15px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#991b1b', textTransform: 'uppercase' }}>Deductions</h4>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', alignItems: 'center' }}>
                            <span>Advances & Fuel:</span> 
                            <input type="number" value={formData.totalAdvances} readOnly style={{ width: '80px', padding: '4px', textAlign: 'right', border: '1px solid #fca5a5', borderRadius: '4px', backgroundColor: '#fee2e2', fontWeight: 'bold' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', alignItems: 'center' }}>
                            <span style={{color:'#f59e0b', fontWeight:'bold'}}>Auto-Commission:</span> 
                            <input type="number" name="totalCommission" value={formData.totalCommission} onChange={e => setFormData({...formData, totalCommission: e.target.value})} style={{ width: '80px', padding: '4px', textAlign: 'right', border: '1px solid #fca5a5', borderRadius: '4px' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center' }}>
                            <span>Other Deduc.:</span> 
                            <input type="number" name="otherDeductions" value={formData.otherDeductions} onChange={e => setFormData({...formData, otherDeductions: e.target.value})} style={{ width: '80px', padding: '4px', textAlign: 'right', border: '1px solid #fca5a5', borderRadius: '4px' }} />
                        </div>
                    </div>
                </div>

                {/* FINAL ACTION BAR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: '15px 25px', borderRadius: '8px' }}>
                    <div>
                        <span style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Final Net Payable</span><br/>
                        <strong style={{ fontSize: '26px', color: '#4ade80' }}>{money(formData.netPayable)}</strong>
                    </div>
                    <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
                        Generate & Post to Ledger
                    </button>
                </div>
            </form>

            <DataTable data={settlements} columns={columns} title="Settlement History" recycleBinType="vendorSettlements" onRecycleChanged={fetchData} />
        </div>
    );
}
