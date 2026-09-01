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

export default function TripManagement() {
  const [trips, setTrips] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [editId, setEditId] = useState(null);

  // --- Filter States ---
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const initialState = {
      date: new Date().toISOString().split('T')[0], companyId: '', routeId: '', vehicleId: '', driverId: '',
      
      dieselPumpId: '', dieselLiters: '', dieselRate: '', dieselAmount: 0,
      clientAdvanceAccountId: '', clientAdvanceClientAccountId: '', clientAdvanceDate: '', clientAdvanceAmount: '',
      advanceAccountId: '', advanceDate: '', advancePaid: '',
      
      length: '', width: '', height: '',
      odcSize: '', clientOdcRate: '', vendorOdcRate: '',
      clientExtraSizeCharge: 0, vendorExtraSizeCharge: 0,
      
      haltingDays: '', clientHaltRate: '', vendorHaltRate: '',
      clientHaltingCharge: 0, vendorHaltingCharge: 0,
      
      billWeight: '', guaranteeWeight: '', netWeight: 0, clientCalcType: 'PerTon', clientRate: '', vendorCalcType: 'PerTon', vendorRate: '', commission: '',
      totalClientBill: 0, netTruckPayout: 0, status: 'In-Transit'
  };
  const [formData, setFormData] = useState(initialState);

  const fetchData = async () => {
      try {
          const [tRes, cRes, rRes, vRes, aRes, drRes] = await Promise.all([
              fetch('/api/trips'), fetch('/api/companies'), fetch('/api/routes-master'), 
              fetch('/api/vehicles'), fetch('/api/ledger/accounts'), fetch('/api/drivers')
          ]);
          if (tRes.ok) setTrips(await tRes.json());
          if (cRes.ok) setCompanies(await cRes.json());
          if (rRes.ok) setRoutes(await rRes.json());
          if (vRes.ok) setVehicles(await vRes.json());
          if (aRes.ok) setAccounts(await aRes.json());
          if (drRes.ok) setDrivers(await drRes.json());
      } catch (err) { console.error(err); }
  };
  
  useEffect(() => { fetchData(); }, []);

  // Determine if selected vehicle is an LPG Tanker to toggle UI
  const selectedVehicle = vehicles.find(v => String(v.id) === String(formData.vehicleId));
  const selectedClientLedger = accounts.find(a => a.clientId === parseInt(formData.companyId) || String(a.clientId) === String(formData.companyId));
  const isLpgTanker = selectedVehicle?.type === 'LPG Tanker';

  useEffect(() => {
      if (!selectedClientLedger) return;
      setFormData(prev => {
          const nextValue = String(selectedClientLedger.id);
          if (prev.clientAdvanceClientAccountId === nextValue) return prev;
          return { ...prev, clientAdvanceClientAccountId: nextValue };
      });
  }, [selectedClientLedger?.id]);

  // MASTER MATH ENGINE
  useEffect(() => {
      const fuelLiters = parseFloat(formData.dieselLiters) || 0;
      const fuelRate = parseFloat(formData.dieselRate) || 0;
      const fuelTotal = fuelLiters * fuelRate;

      // If it's an LPG Tanker, force ODC and Halting to 0 regardless of residual state
      const odc = isLpgTanker ? 0 : (parseFloat(formData.odcSize) || 0);
      const cOdcCharge = odc * (parseFloat(formData.clientOdcRate) || 0);
      const vOdcCharge = odc * (parseFloat(formData.vendorOdcRate) || 0);

      const days = isLpgTanker ? 0 : (parseFloat(formData.haltingDays) || 0);
      const cHaltCharge = days * (parseFloat(formData.clientHaltRate) || 0);
      const vHaltCharge = days * (parseFloat(formData.vendorHaltRate) || 0);

      let cFreight = 0, vFreight = 0;
      
      // STRICT TRUNCATION: Prevents rounding up fractional rupees (e.g., 15.559 -> 15.55)
      const billingWeight = parseFloat(formData.billWeight) || 0;
      const guaranteeWeight = parseFloat(formData.guaranteeWeight) || 0;
      const rawWeight = Math.max(billingWeight, guaranteeWeight);
      const w = Math.trunc(rawWeight * 100) / 100;
      
      const cRate = parseFloat(formData.clientRate) || 0;
      const vRate = parseFloat(formData.vendorRate) || 0;

      if (formData.clientCalcType === 'Fixed') cFreight = cRate;
      else cFreight = w * cRate;

      if (formData.vendorCalcType === 'Fixed') vFreight = vRate;
      else vFreight = w * vRate;

      setFormData(prev => ({
          ...prev,
          dieselAmount: fuelTotal,
          clientExtraSizeCharge: cOdcCharge,
          vendorExtraSizeCharge: vOdcCharge,
          clientHaltingCharge: cHaltCharge,
          vendorHaltingCharge: vHaltCharge,
          netWeight: w,
          totalClientBill: cFreight + cOdcCharge + cHaltCharge,
          netTruckPayout: vFreight + vOdcCharge + vHaltCharge
      }));
  }, [
      formData.dieselLiters, formData.dieselRate, formData.odcSize, formData.clientOdcRate, formData.vendorOdcRate,
      formData.haltingDays, formData.clientHaltRate, formData.vendorHaltRate, formData.billWeight, formData.guaranteeWeight, formData.clientRate,
      formData.vendorRate, formData.clientCalcType, formData.vendorCalcType, isLpgTanker
  ]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleRouteChange = (e) => {
      const selectedRoute = routes.find(r => String(r.id) === String(e.target.value));
      if (selectedRoute) {
          setFormData({ ...formData, routeId: e.target.value, clientCalcType: selectedRoute.calcType, clientRate: selectedRoute.defaultRate });
      } else {
          setFormData({ ...formData, routeId: e.target.value });
      }
  };

  const handleEdit = (t) => {
      setEditId(t.id);
      setFormData({
          ...t,
          date: t.date ? new Date(t.date).toISOString().split('T')[0] : '',
          advanceDate: t.advanceDate ? new Date(t.advanceDate).toISOString().split('T')[0] : '',
          dieselPumpId: t.dieselAccountId || '', 
          advanceAccountId: t.advanceAccountId || '',
          driverId: t.driverId || '',
          commission: t.commission || ''
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      
      // Clean payload: Remove ODC and Halting data if LPG Tanker to keep DB clean
      const payload = { ...formData };
      if (isLpgTanker) {
          payload.length = null; payload.width = null; payload.height = null;
          payload.odcSize = 0; payload.clientOdcRate = 0; payload.vendorOdcRate = 0;
          payload.haltingDays = 0; payload.clientHaltRate = 0; payload.vendorHaltRate = 0;
      }

      try {
          const method = editId ? 'PUT' : 'POST';
          const url = editId ? `/api/trips/${editId}` : '/api/trips';
          const response = await fetch(url, {
              method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
          const text = await response.text();
          const data = text ? JSON.parse(text) : {};
          if (!response.ok) throw new Error(data.error);
          
          alert(`Trip ${editId ? 'Updated' : 'Created'} Successfully!`);
          setFormData(initialState); setEditId(null); fetchData();
      } catch (error) { alert(error.message); }
  };

  const handleDelete = async (id) => {
      if (!(await window.confirmSnackbar("Delete this Trip? This will reverse any ledger advance entries."))) return;
      await fetch(`/api/trips/${id}`, { method: 'DELETE' });
      fetchData();
  };

  const handleStatusChange = async (tripId, newStatus) => {
      const tripToUpdate = trips.find(t => t.id === tripId);
      if (!tripToUpdate) return;
      
      if (!(await window.confirmSnackbar(`Are you sure you want to change this trip's status to '${newStatus}'?`))) return;

      const payload = {
          ...tripToUpdate,
          date: tripToUpdate.date ? new Date(tripToUpdate.date).toISOString().split('T')[0] : undefined,
          advanceDate: tripToUpdate.advanceDate ? new Date(tripToUpdate.advanceDate).toISOString().split('T')[0] : undefined,
          dieselPumpId: tripToUpdate.dieselAccountId || null,
          advanceAccountId: tripToUpdate.advanceAccountId || null,
          driverId: tripToUpdate.driverId || null,
          status: newStatus
      };

      try {
          const res = await fetch(`/api/trips/${tripId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error("Failed to update status");
          fetchData(); 
      } catch (error) {
          alert("Error updating status: " + error.message);
      }
  };

  const filteredTrips = trips.filter(t => {
      if (filterStatus !== 'All' && t.status !== filterStatus) return false;
      if (filterClient && String(t.companyId || '') !== filterClient) return false;
      if (filterStartDate && new Date(t.date) < new Date(filterStartDate)) return false;
      if (filterEndDate && new Date(t.date) > new Date(filterEndDate)) return false;
      return true;
  });

  const columns = [
      { header: 'TRIP NO', key: 'tripNo', render: (t) => <strong>{t.tripNo}</strong> },
      { header: 'DATE', key: 'date', render: (t) => dateText(t.date) },
      { header: 'ROUTE', key: 'route', render: (t) => `${t.route?.fromLocation || '-'} to ${t.route?.toLocation || '-'}` },
      { header: 'VEHICLE', key: 'vehicle', render: (t) => t.vehicle?.regNo || '-' },
      { header: 'CLIENT BILL', key: 'totalClientBill', render: (t) => <strong style={{color:'#16a34a'}}>{money(t.totalClientBill)}</strong> },
      { header: 'CLIENT ADV', key: 'clientAdvanceAmount', render: (t) => num(t.clientAdvanceAmount) > 0 ? <strong style={{color:'#2563eb'}}>{money(t.clientAdvanceAmount)}</strong> : '-' },
      { header: 'DRV/VEN ADV', key: 'advancePaid', render: (t) => num(t.advancePaid) > 0 ? <strong style={{color:'#dc2626'}}>{money(t.advancePaid)}</strong> : '-' },
      { header: 'STATUS', key: 'status', render: (t) => (
          <select 
              value={t.status} 
              onChange={(e) => handleStatusChange(t.id, e.target.value)}
              style={{ 
                  padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer',
                  backgroundColor: t.status === 'Completed' ? '#dcfce7' : t.status === 'Cancelled' ? '#fee2e2' : '#fff7ed', 
                  color: t.status === 'Completed' ? '#16a34a' : t.status === 'Cancelled' ? '#ef4444' : '#ea580c', 
                  fontWeight: 'bold', fontSize: '12px' 
              }}>
              <option value="In-Transit">In-Transit</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
          </select>
      )},
      { header: 'ACTIONS', key: 'actions', render: (t) => (
          <div style={{display:'flex', gap:'10px'}}>
              <button onClick={() => handleEdit(t)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Edit</button>
              <button onClick={() => handleDelete(t.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Del</button>
          </div>
      )}
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Trip Management (Dispatch)</h2>
      
      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
          
          {/* SECTION 1: DISPATCH */}
          <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', color: '#334155' }}>1. Dispatch Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
              <FormGroup label="Dispatch Date" name="date" type="date" value={formData.date} onChange={handleChange} required />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Client Company</label>
                  <select name="companyId" value={formData.companyId} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                      <option value="">-- Select Client --</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                  </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Route</label>
                  <select name="routeId" value={formData.routeId} onChange={handleRouteChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                      <option value="">-- Select Route --</option>
                      {routes.map(r => <option key={r.id} value={r.id}>{r.fromLocation} to {r.toLocation}</option>)}
                  </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Vehicle</label>
                  <select name="vehicleId" value={formData.vehicleId} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                      <option value="">-- Select Vehicle --</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNo} ({v.type})</option>)}
                  </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Driver</label>
                  <select name="driverId" value={formData.driverId} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                      <option value="">-- Select Driver --</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
              </div>
          </div>

          {/* SECTION 2: DIESEL & ADVANCES */}
          <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', color: '#334155' }}>2. Client-Paid Diesel & Trip Advances</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', backgroundColor: '#fff7ed', padding: '15px', borderRadius: '8px', border: '1px solid #ffedd5', marginBottom: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#ea580c' }}>Client-Paid Diesel Mapping</label>
                  <select name="dieselPumpId" value={formData.dieselPumpId} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #fed7aa', fontSize:'13px' }}>
                      <option value="">-- Auto-map client/vendor diesel accounts --</option>
                      {accounts.filter(a => a.accountGroup?.includes('Client Diesel') || a.accountGroup?.includes('Vendor Diesel')).map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
              </div>
              <FormGroup label="Diesel Liters Paid by Client" name="dieselLiters" type="number" value={formData.dieselLiters} onChange={handleChange} />
              <FormGroup label="Rate / Liter (Rs.)" name="dieselRate" type="number" value={formData.dieselRate} onChange={handleChange} />
              <FormGroup label="Client-Paid Diesel Amount" name="dieselAmount" type="number" value={num(formData.dieselAmount).toFixed(2)} disabled />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', backgroundColor: '#eff6ff', padding: '15px', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#1d4ed8' }}>Client Advance Received In</label>
                  <select name="clientAdvanceAccountId" value={formData.clientAdvanceAccountId} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #bfdbfe', fontSize:'13px', backgroundColor: 'white' }}>
                      <option value="">-- Select Cash/Bank --</option>
                      {accounts.filter(a => a.accountGroup?.includes('Bank') || a.accountGroup?.includes('Cash')).map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#1d4ed8' }}>Client Ledger Account (Auto Mapped)</label>
                  <select name="clientAdvanceClientAccountId" value={formData.clientAdvanceClientAccountId} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #bfdbfe', fontSize:'13px', backgroundColor: 'white' }}>
                      <option value="">-- Select Client Ledger --</option>
                      {accounts.filter(a => a.accountGroup?.includes('Sundry Debtors')).map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
              </div>
              <FormGroup label="Client Advance Date" name="clientAdvanceDate" type="date" value={formData.clientAdvanceDate} onChange={handleChange} />
              <FormGroup label="Client Advance Amount (Rs.)" name="clientAdvanceAmount" type="number" value={formData.clientAdvanceAmount} onChange={handleChange} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', backgroundColor: '#fef2f2', padding: '15px', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '25px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#b91c1c' }}>Driver/Vendor Advance Paid From</label>
                  <select name="advanceAccountId" value={formData.advanceAccountId} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #fecaca', fontSize:'13px', backgroundColor: 'white' }}>
                      <option value="">-- Select Cash/Bank --</option>
                      {accounts.filter(a => a.accountGroup?.includes('Bank') || a.accountGroup?.includes('Cash')).map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
              </div>
              <FormGroup label="Driver/Vendor Advance Date" name="advanceDate" type="date" value={formData.advanceDate} onChange={handleChange} />
              <FormGroup label="Driver/Vendor Advance Amount (Rs.)" name="advancePaid" type="number" value={formData.advancePaid} onChange={handleChange} />
          </div>

          {/* SECTION 3: FREIGHT & ADJUSTMENTS */}
          <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', color: '#334155' }}>
              {isLpgTanker ? '3. Freight & Adjustments' : '3. Dimensions, Freight & Adjustments'}
          </h3>
          
          {!isLpgTanker && (
              <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                      <FormGroup label="Trailer Length (ft)" name="length" type="number" value={formData.length} onChange={handleChange} />
                      <FormGroup label="Trailer Width (ft)" name="width" type="number" value={formData.width} onChange={handleChange} />
                      <FormGroup label="Trailer Height (ft)" name="height" type="number" value={formData.height} onChange={handleChange} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
                      <FormGroup label="Extra Size (ODC ft)" name="odcSize" type="number" value={formData.odcSize} onChange={handleChange} />
                      <FormGroup label="Client ODC Rate (Rs.)" name="clientOdcRate" type="number" value={formData.clientOdcRate} onChange={handleChange} />
                      <FormGroup label="Vendor ODC Rate (Rs.)" name="vendorOdcRate" type="number" value={formData.vendorOdcRate} onChange={handleChange} />
                      
                      <FormGroup label="Halting Days" name="haltingDays" type="number" value={formData.haltingDays} onChange={handleChange} />
                      <FormGroup label="Client Halt Rate (Rs.)" name="clientHaltRate" type="number" value={formData.clientHaltRate} onChange={handleChange} />
                      <FormGroup label="Vendor Halt Rate (Rs.)" name="vendorHaltRate" type="number" value={formData.vendorHaltRate} onChange={handleChange} />
                  </div>
              </>
          )}

          {/* Billing Weight is always needed */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '25px' }}>
              <FormGroup label="Billing Weight (Tons)" name="billWeight" type="number" value={formData.billWeight} onChange={handleChange} required />
              <FormGroup label="Guarantee Weight (Tons)" name="guaranteeWeight" type="number" value={formData.guaranteeWeight} onChange={handleChange} />
              <FormGroup label="Net Weight (Tons)" name="netWeight" type="number" value={Number(formData.netWeight || 0).toFixed(2)} onChange={handleChange} disabled />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Client Formula</label>
                  <select name="clientCalcType" value={formData.clientCalcType} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                      <option value="PerTon">Per Ton</option>
                      <option value="Fixed">Fixed Amount</option>
                  </select>
              </div>
              <FormGroup label="Client Rate (Rs.)" name="clientRate" type="number" value={formData.clientRate} onChange={handleChange} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Vendor Formula</label>
                  <select name="vendorCalcType" value={formData.vendorCalcType} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                      <option value="PerTon">Per Ton</option>
                      <option value="Fixed">Fixed Amount</option>
                  </select>
              </div>
              <FormGroup label="Vendor Rate (Rs.)" name="vendorRate" type="number" value={formData.vendorRate} onChange={handleChange} />
              
              <FormGroup label="Trip Commission (Rs.)" name="commission" type="number" value={formData.commission} onChange={handleChange} />
          </div>

          {/* TOTALS BAR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', gap: '30px' }}>
                  <div>
                      <span style={{ fontSize: '11px', color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Client Bill</span><br/>
                      <strong style={{ fontSize: '20px', color: '#15803d' }}>{money(formData.totalClientBill)}</strong>
                  </div>
                  <div>
                      <span style={{ fontSize: '11px', color: '#991b1b', fontWeight: 'bold', textTransform: 'uppercase' }}>Gross Vendor Payout</span><br/>
                      <strong style={{ fontSize: '20px', color: '#b91c1c' }}>{money(formData.netTruckPayout)}</strong>
                  </div>
              </div>
              
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#15803d' }}>Trip Status</label>
                      <select name="status" value={formData.status} onChange={handleChange} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #bbf7d0', fontSize:'13px', fontWeight: 'bold' }}>
                          <option value="In-Transit">In-Transit (Default)</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                      </select>
                  </div>
                  
                  <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      {editId ? 'Update Trip' : 'Save Trip Dispatch'}
                  </button>
              </div>
          </div>
      </form>
      
      {/* FILTER BAR FOR TABLE */}
      <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Filter by Client</label>
              <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}>
                  <option value="">All Clients</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
          </div>
          
          <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}>
                  <option value="All">All Statuses</option>
                  <option value="In-Transit">In-Transit</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
              </select>
          </div>

          <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Start Date</label>
              <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }} />
          </div>

          <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>End Date</label>
              <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" onClick={() => { setFilterClient(''); setFilterStatus('All'); setFilterStartDate(''); setFilterEndDate(''); }} style={{ padding: '9px 15px', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                  Clear
              </button>
          </div>
      </div>

      <DataTable data={filteredTrips} columns={columns} title="Active & Completed Trips" recycleBinType="trips" onRecycleChanged={fetchData} />
    </div>
  );
}
