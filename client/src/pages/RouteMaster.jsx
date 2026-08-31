import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

const FormGroup = ({ label, name, type="text", value, onChange, required=false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{label}</label>
        <input type={type} name={name} value={value || ''} onChange={onChange} required={required} step="any"
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px' }} />
    </div>
);

export default function RouteMaster() {
  const [routes, setRoutes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editId, setEditId] = useState(null);

  const initialState = {
      companyId: '', fromLocation: '', toLocation: '', rtkm: '', calcType: 'PerTon', defaultRate: ''
  };
  const [formData, setFormData] = useState(initialState);

  const fetchData = async () => {
      const [rRes, cRes] = await Promise.all([ fetch('/api/routes-master'), fetch('/api/companies') ]);
      if (rRes.ok) setRoutes(await rRes.json());
      if (cRes.ok) setCompanies(await cRes.json());
  };
  useEffect(() => { fetchData(); }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleEdit = (r) => {
      setEditId(r.id);
      setFormData({ ...r });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      try {
          const method = editId ? 'PUT' : 'POST';
          const url = editId ? `/api/routes-master/${editId}` : '/api/routes-master';
          const response = await fetch(url, {
              method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
          });
          const text = await response.text();
          const data = text ? JSON.parse(text) : {};
          if (!response.ok) throw new Error(data.error);
          alert(`Route ${editId ? 'Updated' : 'Created'}`);
          setFormData(initialState); setEditId(null); fetchData();
      } catch (error) {
          alert(error.message);
      }
  };

  const handleDelete = async (id) => {
      if (!(await window.confirmSnackbar("Delete Route?"))) return;
      await fetch(`/api/routes-master/${id}`, { method: 'DELETE' });
      fetchData();
  };

  const columns = [
      { header: 'Client', key: 'company.companyName', render: (r) => r.company?.companyName },
      { header: 'Route', key: 'route', render: (r) => <strong>{r.fromLocation} to {r.toLocation}</strong> },
      { header: 'RTKM', key: 'rtkm', render: (r) => `${r.rtkm} KM` },
      { header: 'Default Rate', key: 'defaultRate', render: (r) => `Rs.${r.defaultRate} (${r.calcType})` },
      { header: 'Actions', key: 'actions', render: (r) => (
          <div style={{display:'flex', gap:'10px'}}>
              <button onClick={() => handleEdit(r)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer'}}>Edit</button>
              <button onClick={() => handleDelete(r.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer'}}>Delete</button>
          </div>
      )}
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Route & Rate Master</h2>
      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Client Company</label>
                  <select name="companyId" value={formData.companyId} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                      <option value="">-- Select Client --</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                  </select>
              </div>
              <FormGroup label="From Location" name="fromLocation" value={formData.fromLocation} onChange={handleChange} required />
              <FormGroup label="To Location" name="toLocation" value={formData.toLocation} onChange={handleChange} required />
              <FormGroup label="Round Trip KM (RTKM)" name="rtkm" type="number" value={formData.rtkm} onChange={handleChange} required />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Calculation Type</label>
                  <select name="calcType" value={formData.calcType} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                      <option value="PerTon">Per Ton</option>
                      <option value="Fixed">Fixed Freight</option>
                  </select>
              </div>
              <FormGroup label="Default Rate (Rs.)" name="defaultRate" type="number" value={formData.defaultRate} onChange={handleChange} required />
          </div>

          <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              {editId ? 'Update Route' : 'Save Route'}
          </button>
      </form>
      <DataTable data={routes} columns={columns} />
    </div>
  );
}
