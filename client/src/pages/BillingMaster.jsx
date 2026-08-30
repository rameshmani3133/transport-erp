import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

const FormGroup = ({ label, name, value, onChange, required=false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{label}</label>
        <input type="text" name={name} value={value} onChange={onChange} required={required}
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px' }} />
    </div>
);

export default function BillingMaster() {
  const [parentCompanies, setParentCompanies] = useState([]);
  const [editId, setEditId] = useState(null);

  const initialState = {
      companyName: '',
      address: '',
      gstin: '',
      pan: '',
      bankName: '',
      accountNumber: '',
      ifscCode: ''
  };

  const [formData, setFormData] = useState(initialState);

  const fetchData = async () => {
      try {
          const res = await fetch('/api/billing');
          if (res.ok) {
              setParentCompanies(await res.json());
          }
      } catch (err) {
          console.error("Error fetching parent companies:", err);
      }
  };

  useEffect(() => { fetchData(); }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleEdit = (company) => {
      setEditId(company.id);
      setFormData({
          companyName: company.companyName || '',
          address: company.address || '',
          gstin: company.gstin || '',
          pan: company.pan || '',
          bankName: company.bankName || '',
          accountNumber: company.accountNumber || '',
          ifscCode: company.ifscCode || ''
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      try {
          const method = editId ? 'PUT' : 'POST';
          const url = editId ? `/api/billing/${editId}` : '/api/billing';
          
          const response = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
          });

          const text = await response.text();
          const data = text ? JSON.parse(text) : {};

          if (!response.ok) {
              throw new Error(data.error || "Failed to save Parent Company.");
          }

          alert(`Parent Company ${editId ? 'Updated' : 'Created'} Successfully!`);
          setFormData(initialState);
          setEditId(null);
          fetchData();
      } catch (error) {
          console.error("Submission Error:", error);
          alert(error.message);
      }
  };

  const handleDelete = async (id) => {
      if (!(await window.confirmSnackbar("Are you sure you want to delete this Parent Company?"))) return;
      try {
          const response = await fetch(`/api/billing/${id}`, { method: 'DELETE' });
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
      { header: 'GSTIN', key: 'gstin', render: (c) => c.gstin || 'N/A' },
      { header: 'PAN', key: 'pan', render: (c) => c.pan || 'N/A' },
      { header: 'Bank Name', key: 'bankName', render: (c) => c.bankName || 'N/A' },
      { header: 'Actions', key: 'actions', render: (c) => (
          <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => handleEdit(c)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Edit</button>
              <button type="button" onClick={() => handleDelete(c.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Delete</button>
          </div>
      )}
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Billing Master (Parent Company Setup)</h2>

      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', width: '100%' }}>
                  {editId ? 'Edit Parent Company' : 'Register New Parent Company'}
              </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <FormGroup label="Parent Company Name" name="companyName" value={formData.companyName} onChange={handleChange} required />
              <FormGroup label="Address" name="address" value={formData.address} onChange={handleChange} />
              <FormGroup label="GSTIN" name="gstin" value={formData.gstin} onChange={handleChange} required />
              <FormGroup label="PAN Number" name="pan" value={formData.pan} onChange={handleChange} />
          </div>

          <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', marginTop: '20px' }}>Bank Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <FormGroup label="Bank Name" name="bankName" value={formData.bankName} onChange={handleChange} />
              <FormGroup label="Account Number" name="accountNumber" value={formData.accountNumber} onChange={handleChange} />
              <FormGroup label="IFSC Code" name="ifscCode" value={formData.ifscCode} onChange={handleChange} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {editId && (
                  <button type="button" onClick={() => { setEditId(null); setFormData(initialState); }} style={{ padding: '10px 20px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              )}
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {editId ? 'Update Parent Company' : 'Save Parent Company'}
              </button>
          </div>
      </form>

      <DataTable data={parentCompanies} columns={columns} title="Registered Parent Companies" />
    </div>
  );
}