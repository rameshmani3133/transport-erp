import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

const num = (value) => Number(value || 0);
const money = (value) => `Rs.${num(value).toFixed(2)}`;
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-';

const FormGroup = ({ label, name, type="text", value, onChange, required=false, disabled=false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{label}</label>
        <input type={type} name={name} value={value || ''} onChange={onChange} required={required} disabled={disabled} step="any"
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px', backgroundColor: disabled ? '#f1f5f9' : 'white' }} />
    </div>
);

export default function DieselManagement() {
    const [diesels, setDiesels] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [trips, setTrips] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [editId, setEditId] = useState(null);

    const initialState = {
        date: new Date().toISOString().split('T')[0],
        vehicleId: '', driverId: '', tripId: '',
        pumpAccountId: '', paymentMode: 'Credit', slipNumber: '',
        quantityLiters: '', ratePerLiter: '', totalAmount: 0
    };
    const [formData, setFormData] = useState(initialState);

    const fetchData = async () => {
        try {
            const [dRes, vRes, drRes, tRes, aRes] = await Promise.all([
                fetch('/api/diesel'), fetch('/api/vehicles'), fetch('/api/drivers'),
                fetch('/api/trips'), fetch('/api/ledger/accounts')
            ]);
            if (dRes.ok) setDiesels(await dRes.json());
            if (vRes.ok) setVehicles(await vRes.json());
            if (drRes.ok) setDrivers(await drRes.json());
            if (tRes.ok) setTrips(await tRes.json());
            if (aRes.ok) setAccounts(await aRes.json());
        } catch (error) { console.error("Error loading diesel data:", error); }
    };

    useEffect(() => { fetchData(); }, []);

    // Auto-calculate Total Amount
    useEffect(() => {
        const liters = parseFloat(formData.quantityLiters) || 0;
        const rate = parseFloat(formData.ratePerLiter) || 0;
        setFormData(prev => ({ ...prev, totalAmount: liters * rate }));
    }, [formData.quantityLiters, formData.ratePerLiter]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleEdit = (d) => {
        setEditId(d.id);
        setFormData({
            ...d,
            date: d.date ? new Date(d.date).toISOString().split('T')[0] : '',
            vehicleId: d.vehicleId || '',
            driverId: d.driverId || '',
            tripId: d.tripId || '',
            pumpAccountId: d.pumpAccountId || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const method = editId ? 'PUT' : 'POST';
            const url = editId ? `/api/diesel/${editId}` : '/api/diesel';
            const response = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
            });
            
            if (!response.ok) throw new Error("Failed to save entry");
            
            alert(`Diesel Entry ${editId ? 'Updated' : 'Logged'} Successfully!`);
            setFormData(initialState);
            setEditId(null);
            fetchData();
        } catch (error) { alert(error.message); }
    };

    const handleDelete = async (id) => {
        if (!(await window.confirmSnackbar("Are you sure you want to delete this diesel slip?"))) return;
        await fetch(`/api/diesel/${id}`, { method: 'DELETE' });
        fetchData();
    };

    const columns = [
        { header: 'Date', key: 'date', render: (d) => dateText(d.date) },
        { header: 'Vehicle', key: 'vehicle', sortValue: d => d.vehicle?.regNo || '', render: (d) => <strong>{d.vehicle?.regNo}</strong> },
        { header: 'Pump / Creditor', key: 'pump', sortValue: d => d.pumpAccount?.accountName || '', render: (d) => d.pumpAccount?.accountName || <span style={{color:'red'}}>Unlinked</span> },
        { header: 'Slip No', key: 'slipNumber', render: (d) => d.slipNumber || '-' },
        { header: 'Liters', key: 'liters', sortValue: d => num(d.quantityLiters), render: (d) => `${num(d.quantityLiters).toFixed(2)} L` },
        { header: 'Amount', key: 'total', sortValue: d => num(d.totalAmount), render: (d) => <strong style={{color:'#ea580c'}}>{money(d.totalAmount)}</strong> },
        { header: 'Actions', key: 'actions', render: (d) => (
            <div style={{display:'flex', gap:'10px'}}>
                <button onClick={() => handleEdit(d)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Edit</button>
                <button onClick={() => handleDelete(d.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Del</button>
            </div>
        )}
    ];

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Diesel Tracking & Fuel Slips</h2>
            
            <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
                
                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', color: '#334155' }}>1. Vehicle & Pump Linking</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                    <FormGroup label="Slip Date" name="date" type="date" value={formData.date} onChange={handleChange} required />
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Vehicle</label>
                        <select name="vehicleId" value={formData.vehicleId} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                            <option value="">-- Select Vehicle --</option>
                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNo}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: '#ea580c' }}>Fuel Pump Ledger Account</label>
                        <select name="pumpAccountId" value={formData.pumpAccountId} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #fed7aa', backgroundColor: '#fff7ed', fontSize:'13px' }}>
                            <option value="">-- Select Creditor / Pump --</option>
                            {accounts.filter(a => a.accountGroup?.toLowerCase().includes('pump') || a.accountGroup?.toLowerCase().includes('creditor')).map(a => 
                                <option key={a.id} value={a.id}>{a.accountName}</option>
                            )}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Link to Trip (Optional)</label>
                        <select name="tripId" value={formData.tripId} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                            <option value="">-- Standalone (No Trip) --</option>
                            {trips.filter(t => String(t.vehicleId || '') === String(formData.vehicleId || '')).map(t => 
                                <option key={t.id} value={t.id}>{t.tripNo} ({t.route?.toLocation})</option>
                            )}
                        </select>
                    </div>
                </div>

                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', color: '#334155' }}>2. Fuel Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '25px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <FormGroup label="Slip / Bill Number" name="slipNumber" value={formData.slipNumber} onChange={handleChange} />
                    <FormGroup label="Quantity (Liters)" name="quantityLiters" type="number" value={formData.quantityLiters} onChange={handleChange} required />
                    <FormGroup label="Rate Per Liter (Rs.)" name="ratePerLiter" type="number" value={formData.ratePerLiter} onChange={handleChange} required />
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: '#16a34a' }}>Total Amount (Rs.)</label>
                        <input type="number" value={num(formData.totalAmount).toFixed(2)} disabled style={{ padding: '8px', borderRadius: '4px', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', fontSize:'13px', fontWeight: 'bold' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    {editId && <button type="button" onClick={() => { setEditId(null); setFormData(initialState); }} style={{ padding: '12px 24px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>}
                    <button type="submit" style={{ padding: '12px 24px', backgroundColor: editId ? '#f59e0b' : '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        {editId ? 'Update Diesel Slip' : 'Log Diesel Entry'}
                    </button>
                </div>
            </form>
            
            <DataTable data={diesels} columns={columns} title="Diesel Log History" recycleBinType="dieselEntries" onRecycleChanged={fetchData} onNavigateRecord={handleEdit} activeRecordId={editId} />
        </div>
    );
}
