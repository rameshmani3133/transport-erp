import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

// Reusable Form Group Component for clean UI
const FormGroup = ({ label, name, type = "text", value, onChange, required = false, disabled = false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{label}</label>
        <input type={type} name={name} value={value || ''} onChange={onChange} required={required} disabled={disabled} step="any"
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', backgroundColor: disabled ? '#f1f5f9' : 'white' }} />
    </div>
);

export default function VehicleMaster() {
    const [vehicles, setVehicles] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [editId, setEditId] = useState(null);

    const initialState = {
        regNo: '', type: '', capacityTon: '', ownershipType: 'Owned', ownerName: '',
        vendorAccountId: '', status: 'Active',
        
        // Standard Expiries
        regDate: '', fcExpiry: '', permit1YrExpiry: '', permit5YrExpiry: '', qTaxExpiry: '', pucExpiry: '',
        insuranceExpiry: '', cllExpiry: '', pliExpiry: '', explosiveExpiry: '', fitmentDetails: '',
        
        // LPG Tanker Specifics
        pesoExpiry: '', rule18Expiry: '', rule19Expiry: '', rule43Expiry: '',
        sv1Num: '', sv2Num: '', sv3Num: '', iv1Num: '', iv2Num: '', iv3Num: '',
        sv1Expiry: '', sv2Expiry: '', sv3Expiry: '', iv1Expiry: '', iv2Expiry: '', iv3Expiry: ''
    };
    
    const [formData, setFormData] = useState(initialState);

    const fetchData = async () => {
        try {
            const [vRes, aRes] = await Promise.all([
                fetch('/api/vehicles'), fetch('/api/ledger/accounts')
            ]);
            if (vRes.ok) setVehicles(await vRes.json());
            if (aRes.ok) setAccounts(await aRes.json());
        } catch (error) { console.error("Error loading data:", error); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleOwnershipChange = (e) => {
        const ownershipType = e.target.value;
        setFormData(prev => ({
            ...prev,
            ownershipType,
            vendorAccountId: ownershipType === 'Market' ? prev.vendorAccountId : ''
        }));
    };

    // Helper to safely format ISO dates for HTML date inputs
    const formatDate = (dateString) => dateString ? new Date(dateString).toISOString().split('T')[0] : '';

    const handleEdit = (v) => {
        setEditId(v.id);
        setFormData({
            ...v,
            capacityTon: v.capacityTon || '',
            vendorAccountId: v.vendorAccountId || '',
            regDate: formatDate(v.regDate),
            fcExpiry: formatDate(v.fcExpiry),
            permit1YrExpiry: formatDate(v.permit1YrExpiry),
            permit5YrExpiry: formatDate(v.permit5YrExpiry),
            qTaxExpiry: formatDate(v.qTaxExpiry),
            pucExpiry: formatDate(v.pucExpiry),
            insuranceExpiry: formatDate(v.insuranceExpiry),
            cllExpiry: formatDate(v.cllExpiry),
            pliExpiry: formatDate(v.pliExpiry),
            explosiveExpiry: formatDate(v.explosiveExpiry),
            
            pesoExpiry: formatDate(v.pesoExpiry),
            rule18Expiry: formatDate(v.rule18Expiry),
            rule19Expiry: formatDate(v.rule19Expiry),
            rule43Expiry: formatDate(v.rule43Expiry),
            
            sv1Num: v.sv1Num || '', sv2Num: v.sv2Num || '', sv3Num: v.sv3Num || '',
            iv1Num: v.iv1Num || '', iv2Num: v.iv2Num || '', iv3Num: v.iv3Num || '',
            sv1Expiry: formatDate(v.sv1Expiry),
            sv2Expiry: formatDate(v.sv2Expiry),
            sv3Expiry: formatDate(v.sv3Expiry),
            iv1Expiry: formatDate(v.iv1Expiry),
            iv2Expiry: formatDate(v.iv2Expiry),
            iv3Expiry: formatDate(v.iv3Expiry)
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Clean up payload (convert empty strings to null for backend mapping)
            const payload = { ...formData };
            if (payload.type !== 'LPG Tanker') {
                // If not LPG, wipe out LPG specific data so it doesn't clutter DB
                payload.pesoExpiry = null; payload.rule18Expiry = null; payload.rule19Expiry = null; payload.rule43Expiry = null;
                payload.sv1Num = ''; payload.sv2Num = ''; payload.sv3Num = ''; payload.iv1Num = ''; payload.iv2Num = ''; payload.iv3Num = '';
                payload.sv1Expiry = null; payload.sv2Expiry = null; payload.sv3Expiry = null; payload.iv1Expiry = null; payload.iv2Expiry = null; payload.iv3Expiry = null;
            }

            const method = editId ? 'PUT' : 'POST';
            const url = editId ? `/api/vehicles/${editId}` : '/api/vehicles';
            
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            
            if (!res.ok) throw new Error("Failed to save vehicle");
            
            alert(`Vehicle ${editId ? 'Updated' : 'Added'} Successfully!`);
            setFormData(initialState);
            setEditId(null);
            fetchData();
        } catch (error) { alert(error.message); }
    };

    const handleDelete = async (id) => {
        if (!(await window.confirmSnackbar("Are you sure you want to delete this vehicle?"))) return;
        try {
            await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
            fetchData();
        } catch (error) { alert("Cannot delete vehicle. It is likely tied to active trips."); }
    };

    const columns = [
        { header: 'Reg No', key: 'regNo', render: v => <strong style={{color:'#1e293b'}}>{v.regNo}</strong> },
        { header: 'Type', key: 'type', render: v => v.type },
        { header: 'Capacity', key: 'capacityTon', render: v => `${v.capacityTon} T` },
        { header: 'Owner', key: 'ownerName', render: v => v.ownerName || '-' },
        { header: 'Ownership', key: 'ownershipType', render: v => (
            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', backgroundColor: v.ownershipType === 'Owned' ? '#dcfce7' : '#e0e7ff', color: v.ownershipType === 'Owned' ? '#16a34a' : '#4f46e5' }}>
                {v.ownershipType}
            </span>
        )},
        { header: 'Vendor Ledger', key: 'vendorAccount.accountName', render: v => v.vendorAccount?.accountName || '-' },
        { header: 'FC Expiry', key: 'fcExpiry', render: v => v.fcExpiry ? new Date(v.fcExpiry).toLocaleDateString() : '-' },
        { header: 'PESO Expiry', key: 'pesoExpiry', render: v => v.pesoExpiry ? <span style={{color: '#ea580c', fontWeight: 'bold'}}>{new Date(v.pesoExpiry).toLocaleDateString()}</span> : '-' },
        { header: 'Status', key: 'status', render: v => <span style={{color: v.status === 'Active' ? '#16a34a' : '#ef4444', fontWeight: 'bold'}}>{v.status}</span> },
        { header: 'Actions', key: 'actions', render: v => (
            <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => handleEdit(v)} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Edit</button>
                <button onClick={() => handleDelete(v.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Del</button>
            </div>
        )}
    ];

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Vehicle & Asset Master</h2>

            <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
                
                {/* 1. BASIC DETAILS */}
                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', color: '#334155' }}>1. Basic Details & Ownership</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                    <FormGroup label="Registration Number" name="regNo" value={formData.regNo} onChange={handleChange} required />
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Vehicle Type</label>
                        <select name="type" value={formData.type} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px', fontWeight: 'bold', color: '#1e293b' }}>
                            <option value="">-- Select Type --</option>
                            <option value="Trailer">Trailer</option>
                            <option value="Open Body">Open Body</option>
                            <option value="Container">Container</option>
                            <option value="LPG Tanker">LPG Tanker</option>
                            <option value="Liquid Tanker">Liquid Tanker</option>
                            <option value="Tipper">Tipper</option>
                            <option value="LCV / Mini Truck">LCV / Mini Truck</option>
                        </select>
                    </div>

                    <FormGroup label="Capacity (Tons)" name="capacityTon" type="number" value={formData.capacityTon} onChange={handleChange} />
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Ownership Type</label>
                        <select name="ownershipType" value={formData.ownershipType} onChange={handleOwnershipChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                            <option value="Owned">Owned (Company Fleet)</option>
                            <option value="Market">Market (Vendor/Attached)</option>
                        </select>
                    </div>

                    <FormGroup
                        label={formData.ownershipType === 'Market' ? 'Owner / Vendor Name' : 'Owner Name'}
                        name="ownerName"
                        value={formData.ownerName}
                        onChange={handleChange}
                        required={formData.ownershipType === 'Market'}
                    />

                    {formData.ownershipType === 'Market' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <label style={{ fontSize: '11px', fontWeight: '600', color: '#4f46e5' }}>Vendor Ledger Account</label>
                            <select name="vendorAccountId" value={formData.vendorAccountId} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #c7d2fe', backgroundColor: '#eef2ff', fontSize:'13px' }}>
                                <option value="">-- Auto-create from owner if blank --</option>
                                {accounts.filter(a => a.accountGroup?.toLowerCase().includes('creditor')).map(a => 
                                    <option key={a.id} value={a.id}>{a.accountName}</option>
                                )}
                            </select>
                        </div>
                    )}
                </div>

                {/* 2. STANDARD COMPLIANCE */}
                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', color: '#334155' }}>2. Standard Compliance & Expiries</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '25px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <FormGroup label="Registration Date" name="regDate" type="date" value={formData.regDate} onChange={handleChange} />
                    <FormGroup label="FC Expiry" name="fcExpiry" type="date" value={formData.fcExpiry} onChange={handleChange} />
                    <FormGroup label="Permit (1 Yr) Expiry" name="permit1YrExpiry" type="date" value={formData.permit1YrExpiry} onChange={handleChange} />
                    <FormGroup label="Permit (5 Yr) Expiry" name="permit5YrExpiry" type="date" value={formData.permit5YrExpiry} onChange={handleChange} />
                    <FormGroup label="Quarterly Tax Expiry" name="qTaxExpiry" type="date" value={formData.qTaxExpiry} onChange={handleChange} />
                    <FormGroup label="PUC Expiry" name="pucExpiry" type="date" value={formData.pucExpiry} onChange={handleChange} />
                    <FormGroup label="Insurance Expiry" name="insuranceExpiry" type="date" value={formData.insuranceExpiry} onChange={handleChange} />
                    <FormGroup label="CLL Expiry" name="cllExpiry" type="date" value={formData.cllExpiry} onChange={handleChange} />
                    <FormGroup label="PLI Expiry" name="pliExpiry" type="date" value={formData.pliExpiry} onChange={handleChange} />
                    <FormGroup label="Explosive License Expiry" name="explosiveExpiry" type="date" value={formData.explosiveExpiry} onChange={handleChange} />
                </div>

                {/* 3. CONDITIONAL LPG TANKER SECTION */}
                {formData.type === 'LPG Tanker' && (
                    <>
                        <h3 style={{ fontSize: '14px', borderBottom: '1px solid #fed7aa', paddingBottom: '10px', marginBottom: '15px', color: '#c2410c' }}>ðŸ”¥ 3. LPG Tanker Specifics & Valve Tests</h3>
                        
                        {/* Expiry Dates */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px', backgroundColor: '#fff7ed', padding: '15px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                            <FormGroup label="PESO License Expiry" name="pesoExpiry" type="date" value={formData.pesoExpiry} onChange={handleChange} />
                            <FormGroup label="Safety Valve Expiry (Rule 18)" name="rule18Expiry" type="date" value={formData.rule18Expiry} onChange={handleChange} />
                            <FormGroup label="Hydro Test Expiry (Rule 19)" name="rule19Expiry" type="date" value={formData.rule19Expiry} onChange={handleChange} />
                            <FormGroup label="Rule 43 Expiry" name="rule43Expiry" type="date" value={formData.rule43Expiry} onChange={handleChange} />
                        </div>

                        {/* Valve Numbers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '25px', backgroundColor: '#fff7ed', padding: '15px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                            <FormGroup label="Safety Valve 1 No." name="sv1Num" value={formData.sv1Num} onChange={handleChange} />
                            <FormGroup label="Safety Valve 1 Expiry" name="sv1Expiry" type="date" value={formData.sv1Expiry} onChange={handleChange} />
                            <FormGroup label="Safety Valve 2 No." name="sv2Num" value={formData.sv2Num} onChange={handleChange} />
                            <FormGroup label="Safety Valve 2 Expiry" name="sv2Expiry" type="date" value={formData.sv2Expiry} onChange={handleChange} />
                            <FormGroup label="Safety Valve 3 No." name="sv3Num" value={formData.sv3Num} onChange={handleChange} />
                            <FormGroup label="Safety Valve 3 Expiry" name="sv3Expiry" type="date" value={formData.sv3Expiry} onChange={handleChange} />
                            
                            <FormGroup label="Internal Valve 1 No." name="iv1Num" value={formData.iv1Num} onChange={handleChange} />
                            <FormGroup label="Internal Valve 1 Expiry" name="iv1Expiry" type="date" value={formData.iv1Expiry} onChange={handleChange} />
                            <FormGroup label="Internal Valve 2 No." name="iv2Num" value={formData.iv2Num} onChange={handleChange} />
                            <FormGroup label="Internal Valve 2 Expiry" name="iv2Expiry" type="date" value={formData.iv2Expiry} onChange={handleChange} />
                            <FormGroup label="Internal Valve 3 No." name="iv3Num" value={formData.iv3Num} onChange={handleChange} />
                            <FormGroup label="Internal Valve 3 Expiry" name="iv3Expiry" type="date" value={formData.iv3Expiry} onChange={handleChange} />
                        </div>
                    </>
                )}

                {/* FINAL ACTION BAR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Vehicle Status</label>
                        <select name="status" value={formData.status} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize:'13px', fontWeight: 'bold' }}>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive / Sold</option>
                        </select>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {editId && <button type="button" onClick={() => { setEditId(null); setFormData(initialState); }} style={{ padding: '12px 24px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>}
                        <button type="submit" style={{ padding: '12px 24px', backgroundColor: editId ? '#f59e0b' : '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {editId ? 'Update Vehicle' : 'Save Vehicle'}
                        </button>
                    </div>
                </div>
            </form>

            <DataTable data={vehicles} columns={columns} title="Vehicle Directory" recycleBinType="vehicles" onRecycleChanged={fetchData} />
        </div>
    );
}
