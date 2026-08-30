import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

const FormGroup = ({ label, name, type="text", value, onChange, required=false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{label}</label>
        <input type={type} name={name} value={value || ''} onChange={onChange} required={required}
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px' }} />
    </div>
);

export default function DriverMaster() {
  const [drivers, setDrivers] = useState([]);
  const [editId, setEditId] = useState(null);

  const initialState = {
      name: '', licenseNo: '', licenseExpiry: '', hazmatLicense: false, hazmatExpiry: '',
      address: '', phone: '', aadhaarNumber: '', status: 'Active'
  };
  const [formData, setFormData] = useState(initialState);

  const fetchData = async () => {
      const res = await fetch('/api/drivers');
      if (res.ok) setDrivers(await res.json());
  };
  useEffect(() => { fetchData(); }, []);

  const handleChange = (e) => {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setFormData({ ...formData, [e.target.name]: value });
  };

  const handleEdit = (d) => {
      setEditId(d.id);
      setFormData({
          ...d,
          licenseExpiry: d.licenseExpiry ? new Date(d.licenseExpiry).toISOString().split('T')[0] : '',
          hazmatExpiry: d.hazmatExpiry ? new Date(d.hazmatExpiry).toISOString().split('T')[0] : ''
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      try {
          const method = editId ? 'PUT' : 'POST';
          const url = editId ? `/api/drivers/${editId}` : '/api/drivers';
          const response = await fetch(url, {
              method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
          });
          const text = await response.text();
          const data = text ? JSON.parse(text) : {};
          if (!response.ok) throw new Error(data.error);
          alert(`Driver ${editId ? 'Updated' : 'Created'}`);
          setFormData(initialState); setEditId(null); fetchData();
      } catch (error) {
          alert(error.message);
      }
  };

  const handleDelete = async (id) => {
      if (!(await window.confirmSnackbar("Delete driver?"))) return;
      await fetch(`/api/drivers/${id}`, { method: 'DELETE' });
      fetchData();
  };

  const columns = [
      { header: 'Name', key: 'name', render: (d) => <strong>{d.name}</strong> },
      { header: 'License No', key: 'licenseNo', render: (d) => d.licenseNo },
      { header: 'License Expiry', key: 'licenseExpiry', render: (d) => new Date(d.licenseExpiry).toLocaleDateString() },
      { header: 'Phone', key: 'phone', render: (d) => d.phone },
      { header: 'Status', key: 'status', render: (d) => d.status },
      { header: 'Actions', key: 'actions', render: (d) => (
          <div style={{display:'flex', gap:'10px'}}>
              <button onClick={() => handleEdit(d)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer'}}>Edit</button>
              <button onClick={() => handleDelete(d.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer'}}>Delete</button>
          </div>
      )}
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Driver Master</h2>
      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <FormGroup label="Driver Name" name="name" value={formData.name} onChange={handleChange} required />
              <FormGroup label="Phone Number" name="phone" value={formData.phone} onChange={handleChange} required />
              <FormGroup label="Govt ID / Aadhaar" name="aadhaarNumber" value={formData.aadhaarNumber} onChange={handleChange} required />
              <FormGroup label="License Number" name="licenseNo" value={formData.licenseNo} onChange={handleChange} required />
              <FormGroup label="License Expiry Date" name="licenseExpiry" type="date" value={formData.licenseExpiry} onChange={handleChange} required />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Hazmat Certified</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '100%' }}>
                      <input type="checkbox" name="hazmatLicense" checked={formData.hazmatLicense} onChange={handleChange} />
                      Yes
                  </label>
              </div>
              <FormGroup label="Hazmat Expiry" name="hazmatExpiry" type="date" value={formData.hazmatExpiry} onChange={handleChange} />
          </div>

          <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              {editId ? 'Update Driver' : 'Save Driver'}
          </button>
      </form>
      <DataTable data={drivers} columns={columns} />
    </div>
  );
}
