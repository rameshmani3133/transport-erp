import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

const FormGroup = ({ label, name, value, onChange, required=false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{label}</label>
        <input type="text" name={name} value={value || ''} onChange={onChange} required={required}
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px' }} />
    </div>
);

export default function ClientMaster() {
  const [companies, setCompanies] = useState([]);
  const [editId, setEditId] = useState(null);

  const initialState = {
      companyName: '',
      panNumber: '',
      status: 'Active'
  };

  const [formData, setFormData] = useState(initialState);

  const fetchData = async () => {
      try {
          const res = await fetch('/api/companies');
          if (res.ok) setCompanies(await res.json());
      } catch (err) {
          console.error("Error fetching companies:", err);
      }
  };

  useEffect(() => { fetchData(); }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleEdit = (comp) => {
      setEditId(comp.id);
      setFormData({
          companyName: comp.companyName || '',
          panNumber: comp.panNumber || '',
          status: comp.status || 'Active'
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      try {
          const method = editId ? 'PUT' : 'POST';
          const url = editId ? `/api/companies/${editId}` : '/api/companies';
          
          const response = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
          });

          const text = await response.text();
          const data = text ? JSON.parse(text) : {};

          if (!response.ok) {
              throw new Error(data.error || "Failed to save Company.");
          }

          alert(`Company ${editId ? 'Updated' : 'Created'} Successfully!`);
          setFormData(initialState);
          setEditId(null);
          fetchData();
      } catch (error) {
          console.error("Submission Error:", error);
          alert(error.message);
      }
  };

  const handleDelete = async (id) => {
      if (!(await window.confirmSnackbar("Are you sure you want to delete this Company?"))) return;
      try {
          const response = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
          const text = await response.text();
          const data = text ? JSON.parse(text) : {};
          if (!response.ok) throw new Error(data.error || "Failed to delete company.");
          fetchData();
      } catch (error) {
          alert(error.message);
      }
  };

  const columns = [
      { header: 'Company Name', key: 'companyName', render: (c) => <strong>{c.companyName}</strong> },
      { header: 'PAN Number', key: 'panNumber', render: (c) => c.panNumber || 'N/A' },
      { header: 'Status', key: 'status', render: (c) => (
          <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: c.status === 'Active' ? '#dcfce7' : '#f1f5f9', color: c.status === 'Active' ? '#16a34a' : '#64748b', fontSize: '11px', fontWeight: 'bold' }}>
              {c.status}
          </span>
      )},
      { header: 'Actions', key: 'actions', render: (c) => (
          <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => handleEdit(c)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Edit</button>
              <button type="button" onClick={() => handleDelete(c.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Delete</button>
          </div>
      )}
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Client & Company Master</h2>

      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', width: '100%' }}>
                  {editId ? 'Edit Company' : 'Register New Company'}
              </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <FormGroup label="Company Name" name="companyName" value={formData.companyName} onChange={handleChange} required />
              <FormGroup label="PAN Number" name="panNumber" value={formData.panNumber} onChange={handleChange} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Status</label>
                  <select name="status" value={formData.status} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                  </select>
              </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {editId && (
                  <button type="button" onClick={() => { setEditId(null); setFormData(initialState); }} style={{ padding: '10px 20px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              )}
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {editId ? 'Update Company' : 'Save Company'}
              </button>
          </div>
      </form>

      <DataTable data={companies} columns={columns} title="Registered Companies" />
    </div>
  );
}