import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

const emptyTotals = { totalExp: 0, totalAdvances: 0, netPayable: 0 };
const num = (value) => Number(value || 0);
const money = (value) => `Rs.${num(value).toFixed(2)}`;
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-';

function formatDateInput(value) {
    if (!value) return new Date().toISOString().split('T')[0];
    return new Date(value).toISOString().split('T')[0];
}

export default function DriverSettlement() {
    const [settlements, setSettlements] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [allUnsettledTrips, setAllUnsettledTrips] = useState([]);
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [editId, setEditId] = useState(null);
    const [editNo, setEditNo] = useState('');
    
    // Core Form State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [driverSalary, setDriverSalary] = useState('');
    const [selectedTripIds, setSelectedTripIds] = useState([]);
    
    // Spreadsheet state to hold inputs for each individual trip
    const [tripExpenses, setTripExpenses] = useState({});
    
    // Derived Totals
    const [totals, setTotals] = useState(emptyTotals);

    const fetchData = async () => {
        try {
            const [setRes, drRes, tripRes] = await Promise.all([
                fetch('/api/driver-settlements'), fetch('/api/drivers'), fetch('/api/trips')
            ]);
            if (setRes.ok) setSettlements(await setRes.json());
            if (drRes.ok) setDrivers(await drRes.json());
            if (tripRes.ok) {
                const trips = await tripRes.json();
                setAllUnsettledTrips(trips.filter(t => t.driverId && !t.driverSettlementId));
            }
        } catch (error) { console.error(error); }
    };

    useEffect(() => { fetchData(); }, []);

    const resetForm = () => {
        setEditId(null);
        setEditNo('');
        setSelectedTripIds([]);
        setSelectedDriverId('');
        setDate(new Date().toISOString().split('T')[0]);
        setDriverSalary('');
        setTripExpenses({});
        setTotals(emptyTotals);
    };

    // Filter unsettled trips belonging to the chosen driver. While editing, the saved batch trips are injected into this list.
    const driverTrips = allUnsettledTrips.filter(t => String(t.driverId || '') === selectedDriverId);
    const allDisplayedSelected = driverTrips.length > 0 && driverTrips.every(t => selectedTripIds.includes(t.id));

    // Handle Checkbox Toggles
    const handleSelectAll = (e) => {
        if (e.target.checked) setSelectedTripIds(driverTrips.map(t => t.id));
        else setSelectedTripIds([]);
    };

    const handleTripToggle = (tripId) => {
        setSelectedTripIds(prev => prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]);
    };

    // Update individual trip expense in the state dictionary
    const handleExpenseChange = (tripId, field, value) => {
        setTripExpenses(prev => ({
            ...prev,
            [tripId]: {
                ...prev[tripId],
                [field]: value
            }
        }));
    };

    // MATH ENGINE: Recalculate Live Totals whenever inputs change
    useEffect(() => {
        let expSum = 0;
        let advSum = 0;

        selectedTripIds.forEach(id => {
            // Find the trip to get its advance
            const trip = allUnsettledTrips.find(t => t.id === id);
            advSum += num(trip?.advancePaid);

            // Sum up the inputs from the spreadsheet row
            const ex = tripExpenses[id] || {};
            expSum += (parseFloat(ex.rtoPc) || 0) + 
                      (parseFloat(ex.parking) || 0) + 
                      (parseFloat(ex.loading) || 0) + 
                      (parseFloat(ex.unloading) || 0) + 
                      (parseFloat(ex.otherBillsAmount) || 0);
        });

        const salary = num(driverSalary);
        const net = (expSum + salary) - advSum;

        setTotals({ totalExp: expSum, totalAdvances: advSum, netPayable: net });
    }, [selectedTripIds, tripExpenses, driverSalary, allUnsettledTrips]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (selectedTripIds.length === 0) return alert("Please select at least one trip to settle.");

        // Package the selected trips with their respective expenses
        const tripDetails = selectedTripIds.map(id => {
            const ex = tripExpenses[id] || {};
            return {
                id,
                rtoPc: ex.rtoPc || 0,
                parking: ex.parking || 0,
                loading: ex.loading || 0,
                unloading: ex.unloading || 0,
                otherBillsAmount: ex.otherBillsAmount || 0,
                otherBillsDesc: ex.otherBillsDesc || ''
            };
        });

        const payload = {
            driverId: selectedDriverId,
            date,
            driverSalary,
            advanceDeducted: totals.totalAdvances,
            tripDetails
        };

        try {
            const res = await fetch(editId ? `/api/driver-settlements/${editId}` : '/api/driver-settlements', {
                method: editId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to save payroll.");
            alert(editId ? "Payroll batch updated." : "Payroll Saved! Expenses applied to individual trips & Ledger Updated.");
            resetForm();
            fetchData();
        } catch (error) { alert(error.message); }
    };

    const handleEdit = (settlement) => {
        const trips = settlement.trips || [];
        const expenses = {};
        for (const trip of trips) {
            expenses[trip.id] = {
                rtoPc: trip.rtoPc || '',
                parking: trip.parking || '',
                loading: trip.loading || '',
                unloading: trip.unloading || '',
                otherBillsAmount: trip.otherBillsAmount || '',
                otherBillsDesc: trip.otherBillsDesc || ''
            };
        }

        setAllUnsettledTrips(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const missing = trips.filter(t => !existingIds.has(t.id));
            return [...missing, ...prev];
        });
        setEditId(settlement.id);
        setEditNo(settlement.settlementNo);
        setSelectedDriverId(String(settlement.driverId));
        setDate(formatDateInput(settlement.date));
        setDriverSalary(String(settlement.driverSalary || ''));
        setSelectedTripIds(trips.map(t => t.id));
        setTripExpenses(expenses);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (!(await window.confirmSnackbar("Delete this settlement? Ledger entries will reverse and trip expenses will reset to zero."))) return;
        const res = await fetch(`/api/driver-settlements/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return alert(data.error || 'Failed to delete settlement.');
        if (editId === id) resetForm();
        fetchData();
    };

    // Helper inline style for spreadsheet inputs
    const inputStyle = (disabled) => ({
        width: '65px', padding: '6px', fontSize: '12px', border: '1px solid #cbd5e1', 
        borderRadius: '4px', backgroundColor: disabled ? '#f1f5f9' : '#fff'
    });

    const columns = [
        { header: 'No.', key: 'settlementNo', render: s => <strong>{s.settlementNo}</strong> },
        { header: 'Date', key: 'date', render: s => dateText(s.date) },
        { header: 'Driver', key: 'driver', sortValue: s => s.driver?.name || '', render: s => <strong>{s.driver?.name || '-'}</strong> },
        { header: 'Trips Settled', key: 'trips', sortValue: s => s.trips?.length || 0, render: s => `${s.trips?.length || 0} Trips` },
        { header: 'Total Salary', key: 'salary', sortValue: s => num(s.driverSalary), render: s => money(s.driverSalary) },
        { header: 'Total Advance', key: 'advance', sortValue: s => num(s.advanceDeducted), render: s => money(s.advanceDeducted) },
        { header: 'Net Payout', key: 'net', sortValue: s => num(s.netPayable), render: s => <strong style={{color: num(s.netPayable) >= 0 ? '#16a34a' : '#ea580c'}}>{money(s.netPayable)}</strong> },
        { header: 'Actions', key: 'actions', render: s => (
            <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => handleEdit(s)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Edit</button>
                <button type="button" onClick={() => handleDelete(s.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Del</button>
            </div>
        ) }
    ];

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Driver Monthly Payroll & Trip Settlement</h2>

            <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
                {editId && (
                    <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontWeight: 'bold' }}>
                        Editing saved payroll batch {editNo}
                    </div>
                )}
                
                {/* 1. SELECTION */}
                <div style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>1. Select Driver</label>
                        <select value={selectedDriverId} onChange={(e) => { setSelectedDriverId(e.target.value); setSelectedTripIds([]); setTripExpenses({}); }} required style={{ padding: '10px', borderRadius: '6px', border: '2px solid #cbd5e1' }}>
                            <option value="">-- Choose Driver --</option>
                            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Settlement Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                    </div>
                </div>

                {/* 2. SPREADSHEET TABLE FOR TRIP EXPENSES */}
                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', color: '#334155' }}>2. Select Trips & Enter On-Road Expenses</h3>
                <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '25px', backgroundColor: '#f8fafc' }}>
                    {driverTrips.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px 0' }}>
                            {selectedDriverId ? "No unsettled trips found for this driver." : "Select a driver above to load trips."}
                        </p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', backgroundColor: 'white' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                                    <th style={{ padding: '10px' }}><input type="checkbox" checked={allDisplayedSelected} onChange={handleSelectAll} style={{cursor:'pointer'}} /></th>
                                    <th style={{ padding: '10px' }}>Trip / Route</th>
                                    <th style={{ padding: '10px', color: '#ef4444' }}>Advance</th>
                                    <th style={{ padding: '10px' }}>RTO / PC</th>
                                    <th style={{ padding: '10px' }}>Park / Toll</th>
                                    <th style={{ padding: '10px' }}>Loading</th>
                                    <th style={{ padding: '10px' }}>Unloading</th>
                                    <th style={{ padding: '10px' }}>Other Amt</th>
                                    <th style={{ padding: '10px' }}>Other Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {driverTrips.map(t => {
                                    const isSelected = selectedTripIds.includes(t.id);
                                    const ex = tripExpenses[t.id] || {};
                                    return (
                                        <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isSelected ? '#f0f9ff' : 'white' }}>
                                            <td style={{ padding: '10px' }}><input type="checkbox" checked={isSelected} onChange={() => handleTripToggle(t.id)} style={{cursor:'pointer'}} /></td>
                                            <td style={{ padding: '10px' }}>
                                                <strong>{t.tripNo}</strong><br/>
                                                <span style={{fontSize:'10px', color:'#64748b'}}>{t.route?.toLocation || 'Route not set'}</span>
                                            </td>
                                            <td style={{ padding: '10px', fontWeight: 'bold', color: '#ef4444' }}>{money(t.advancePaid)}</td>
                                            
                                            {/* Inputs unlock only when checkbox is selected */}
                                            <td style={{ padding: '8px' }}><input type="number" step="any" value={ex.rtoPc || ''} onChange={e => handleExpenseChange(t.id, 'rtoPc', e.target.value)} disabled={!isSelected} style={inputStyle(!isSelected)} /></td>
                                            <td style={{ padding: '8px' }}><input type="number" step="any" value={ex.parking || ''} onChange={e => handleExpenseChange(t.id, 'parking', e.target.value)} disabled={!isSelected} style={inputStyle(!isSelected)} /></td>
                                            <td style={{ padding: '8px' }}><input type="number" step="any" value={ex.loading || ''} onChange={e => handleExpenseChange(t.id, 'loading', e.target.value)} disabled={!isSelected} style={inputStyle(!isSelected)} /></td>
                                            <td style={{ padding: '8px' }}><input type="number" step="any" value={ex.unloading || ''} onChange={e => handleExpenseChange(t.id, 'unloading', e.target.value)} disabled={!isSelected} style={inputStyle(!isSelected)} /></td>
                                            <td style={{ padding: '8px' }}><input type="number" step="any" value={ex.otherBillsAmount || ''} onChange={e => handleExpenseChange(t.id, 'otherBillsAmount', e.target.value)} disabled={!isSelected} style={inputStyle(!isSelected)} /></td>
                                            <td style={{ padding: '8px' }}><input type="text" value={ex.otherBillsDesc || ''} onChange={e => handleExpenseChange(t.id, 'otherBillsDesc', e.target.value)} disabled={!isSelected} placeholder="Desc..." style={{...inputStyle(!isSelected), width: '120px'}} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* 3. CALCULATION BAR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: '20px', borderRadius: '8px', color: 'white' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        
                        <div style={{ marginRight: '30px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>Monthly Salary (Rs.)</label><br/>
                            <input type="number" required value={driverSalary} onChange={e => setDriverSalary(e.target.value)} 
                                style={{ padding: '10px', fontSize: '16px', fontWeight: 'bold', borderRadius: '4px', border: '1px solid #475569', backgroundColor: '#334155', color: 'white', width: '150px', marginTop: '5px' }} />
                        </div>

                        <div style={{ borderLeft: '1px solid #475569', paddingLeft: '20px' }}>
                            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Sum of Bills + Salary</span><br/>
                            <strong style={{ fontSize: '18px' }}>{money(num(totals.totalExp) + num(driverSalary))}</strong>
                        </div>
                        <div style={{ paddingLeft: '20px' }}>
                            <span style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase' }}>(-) Trip Advances</span><br/>
                            <strong style={{ fontSize: '18px', color: '#fca5a5' }}>{money(totals.totalAdvances)}</strong>
                        </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Final Net Settlement</span><br/>
                        <strong style={{ fontSize: '26px', color: num(totals.netPayable) >= 0 ? '#4ade80' : '#fb923c' }}>
                            {num(totals.netPayable) >= 0 ? `Pay Driver: ${money(totals.netPayable)}` : `Driver Returns: ${money(Math.abs(num(totals.netPayable)))}`}
                        </strong>
                        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            {editId && (
                                <button type="button" onClick={resetForm} style={{ padding: '12px 24px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    Cancel Edit
                                </button>
                            )}
                            <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                {editId ? 'Update Payroll & Ledger' : 'Save Payroll & Ledger'}
                            </button>
                        </div>
                    </div>
                </div>
            </form>

            <DataTable data={settlements} columns={columns} title="Settled Payroll Batches" recycleBinType="driverSettlements" onRecycleChanged={fetchData} onNavigateRecord={handleEdit} activeRecordId={editId} />
        </div>
    );
}
