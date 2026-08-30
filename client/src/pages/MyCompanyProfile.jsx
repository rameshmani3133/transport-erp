import React, { useState, useEffect } from 'react';

const FormGroup = ({ label, name, value, onChange, required=false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{label}</label>
        <input type="text" name={name} value={value || ''} onChange={onChange} required={required}
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px' }} />
    </div>
);

export default function MyCompanyProfile() {
    const initialState = {
        companyName: '', address: '', gstNumber: '', panNumber: '',
        bankName: '', accountNumber: '', ifscCode: '', signatoryRole: 'Authorized Signatory'
    };
    
    const [formData, setFormData] = useState(initialState);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch on page load
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch('/api/my-company');
                if (res.ok) {
                    const data = await res.json();
                    // If the database returns a profile, merge it so we don't lose default fields
                    if (data && data.id) {
                        setFormData(prev => ({ ...prev, ...data }));
                    }
                }
            } catch (err) {
                console.error("Failed to load profile:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch('/api/my-company', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            if (!response.ok) throw new Error("Failed to save profile.");
            
            // Instantly update the form with the confirmed database record
            const savedData = await response.json();
            setFormData(prev => ({ ...prev, ...savedData }));
            
            alert("✅ Company Profile saved successfully!");
        } catch (error) {
            alert(error.message);
        }
    };

    if (isLoading) return <div style={{ padding: '20px' }}>Loading settings...</div>;

    return (
        <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
            <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>My Company Profile (Settings)</h2>
            
            <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <div style={{ backgroundColor: '#eff6ff', padding: '15px', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '25px' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#1d4ed8' }}>
                        <strong>Note:</strong> The details saved here will automatically appear on all printed invoices.
                    </p>
                </div>

                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>1. Business Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                    <FormGroup label="Logistics Company Name" name="companyName" value={formData.companyName} onChange={handleChange} required />
                    <FormGroup label="GSTIN Number" name="gstNumber" value={formData.gstNumber} onChange={handleChange} />
                    <FormGroup label="PAN Number" name="panNumber" value={formData.panNumber} onChange={handleChange} />
                    <div style={{ gridColumn: '1 / -1' }}>
                        <FormGroup label="Full Registered Address" name="address" value={formData.address} onChange={handleChange} />
                    </div>
                </div>

                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>2. Bank & Payment Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                    <FormGroup label="Bank Name" name="bankName" value={formData.bankName} onChange={handleChange} />
                    <FormGroup label="Account Number" name="accountNumber" value={formData.accountNumber} onChange={handleChange} />
                    <FormGroup label="IFSC Code" name="ifscCode" value={formData.ifscCode} onChange={handleChange} />
                </div>

                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>3. Invoice Signature</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Signatory Title</label>
                        <select name="signatoryRole" value={formData.signatoryRole} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                            <option value="Authorized Signatory">Authorized Signatory</option>
                            <option value="Proprietor">Proprietor</option>
                            <option value="Partner">Partner</option>
                            <option value="Director">Director</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Save Settings
                    </button>
                </div>
            </form>
        </div>
    );
}