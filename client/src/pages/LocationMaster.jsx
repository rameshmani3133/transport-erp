import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

const FormGroup = ({ label, name, value, onChange, required=false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{label}</label>
        <input type="text" name={name} value={value} onChange={onChange} required={required}
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px' }} />
    </div>
);

export default function LocationMaster() {
  const [locations, setLocations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editId, setEditId] = useState(null);

  const initialState = {
      locationName: '',
      address: '',
      gstNumber: '',
      invoiceFormat: 'Standard',
      companyId: ''
  };

  const [formData, setFormData] = useState(initialState);

  const fetchData = async () => {
      try {
          const [locRes, compRes] = await Promise.all([
              fetch('/api/locations'),
              fetch('/api/companies')
          ]);
          
          if (locRes.ok) setLocations(await locRes.json());
          if (compRes.ok) setCompanies(await compRes.json());
      } catch (err) {
          console.error("Error fetching data:", err);
      }
  };

  useEffect(() => { fetchData(); }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleEdit = (loc) => {
      setEditId(loc.id);
      setFormData({
          locationName: loc.locationName || '',
          address: loc.address || '',
          gstNumber: loc.gstNumber || '',
          invoiceFormat: loc.invoiceFormat || 'Standard',
          companyId: loc.companyId || ''
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      try {
          const method = editId ? 'PUT' : 'POST';
          const url = editId ? `/api/locations/${editId}` : '/api/locations';
          
          const response = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
          });

          const text = await response.text();
          const data = text ? JSON.parse(text) : {};

          if (!response.ok) {
              throw new Error(data.error || "Failed to save Location.");
          }

          alert(`Billing Location ${editId ? 'Updated' : 'Created'} Successfully!`);
          setFormData(initialState);
          setEditId(null);
          fetchData();
      } catch (error) {
          console.error("Submission Error:", error);
          alert(error.message);
      }
  };

  const handleDelete = async (id) => {
      if (!(await window.confirmSnackbar("Are you sure you want to delete this Location?"))) return;
      try {
          const response = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
          const text = await response.text();
          const data = text ? JSON.parse(text) : {};
          if (!response.ok) throw new Error(data.error || "Failed to delete location.");
          fetchData();
      } catch (error) {
          alert(error.message);
      }
  };

  const columns = [
      { header: 'Location Name', key: 'locationName', render: (l) => <strong>{l.locationName}</strong> },
      { header: 'Client Company', key: 'company.companyName', render: (l) => l.company?.companyName || 'N/A' },
      { header: 'GST Number', key: 'gstNumber', render: (l) => l.gstNumber || 'N/A' },
      { header: 'Format', key: 'invoiceFormat', render: (l) => <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#f1f5f9', fontSize: '11px', fontWeight: 'bold' }}>{l.invoiceFormat}</span> },
      { header: 'Actions', key: 'actions', render: (l) => (
          <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => handleEdit(l)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Edit</button>
              <button type="button" onClick={() => handleDelete(l.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Delete</button>
          </div>
      )}
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Billing Location Master</h2>

      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', width: '100%' }}>
                  {editId ? 'Edit Billing Location' : 'Register New Billing Location'}
              </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#1d4ed8' }}>Select Client Company</label>
                  <select name="companyId" value={formData.companyId} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', fontSize:'13px' }}>
                      <option value="">-- Select Client --</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                  </select>
              </div>

              <FormGroup label="Branch / Location Name" name="locationName" value={formData.locationName} onChange={handleChange} required />
              <FormGroup label="GST Number" name="gstNumber" value={formData.gstNumber} onChange={handleChange} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Invoice Format</label>
                  <select name="invoiceFormat" value={formData.invoiceFormat} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                      <option value="Standard">Standard</option>
                      <option value="Detailed">Detailed</option>
                  </select>
              </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Full Address</label>
              <textarea name="address" value={formData.address} onChange={handleChange} rows="3" style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px', resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {editId && (
                  <button type="button" onClick={() => { setEditId(null); setFormData(initialState); }} style={{ padding: '10px 20px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              )}
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {editId ? 'Update Location' : 'Save Location'}
              </button>
          </div>
      </form>

      <DataTable data={locations} columns={columns} title="Registered Billing Locations" />
    </div>
  );
}