import React, { useState, useEffect } from 'react';

const FormGroup = ({ label, name, value, onChange, required=false, multiline=false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{label}</label>
        {multiline
            ? <textarea name={name} value={value || ''} onChange={onChange} required={required} rows={4} placeholder="Use a new line for each address line" style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px', resize: 'vertical' }} />
            : <input type="text" name={name} value={value || ''} onChange={onChange} required={required} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px' }} />}
    </div>
);

function normalizeEmails(value) {
    const list = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(list.map(item => String(item || '').trim().toLowerCase()).filter(item => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))];
}

export default function MyCompanyProfile({ isSuperAdmin = false }) {
    const defaultRule48Declaration = 'I/We hereby declare that though our aggregate turnover in any preceding financial year from 2017-18 onwards is more than the aggregate turnover notified under sub-rule (4) of Rule 48, we are not required to prepare an invoice in terms of the provisions of the said sub-rule.';
    const defaultGtaDeclaration = 'I/We have taken registration under the CGST Act, 2017 and have exercised the option to pay tax on services of GTA in relation to transport of goods supplied by us under forward charge.';
    const initialState = {
        tenantKey: '', companyName: '', address: '', gstNumber: '', panNumber: '',
        bankName: '', accountNumber: '', ifscCode: '', bankBranch: '', beneficiaryName: '',
        phoneNumber: '', email: '', signatoryRole: 'Authorized Signatory', signatoryName: '',
        rule48Declaration: defaultRule48Declaration, gtaDeclaration: defaultGtaDeclaration,
        reminderEmails: []
    };
    
    const [formData, setFormData] = useState(initialState);
    const [isLoading, setIsLoading] = useState(true);
    const [newReminderEmail, setNewReminderEmail] = useState('');

    // Fetch on page load
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch('/api/my-company');
                if (res.ok) {
                    const data = await res.json();
                    // If the database returns a profile, merge it so we don't lose default fields
                    if (data && data.id) {
                        setFormData(prev => ({ ...prev, ...data, reminderEmails: normalizeEmails(data.reminderEmails) }));
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

    const addReminderEmail = async () => {
        const email = normalizeEmails([newReminderEmail])[0];
        if (!email) return alert('Enter a valid reminder email.');
        if (!formData.id) {
            setFormData(prev => ({ ...prev, reminderEmails: normalizeEmails([...(prev.reminderEmails || []), email]) }));
            setNewReminderEmail('');
            return;
        }
        const res = await fetch('/api/my-company/reminder-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return alert(data.error || 'Failed to add reminder email.');
        setFormData(prev => ({ ...prev, ...data, reminderEmails: normalizeEmails(data.reminderEmails) }));
        setNewReminderEmail('');
    };

    const removeReminderEmail = async (email) => {
        if (!formData.id) {
            setFormData(prev => ({ ...prev, reminderEmails: normalizeEmails(prev.reminderEmails).filter(item => item !== email) }));
            return;
        }
        const res = await fetch(`/api/my-company/reminder-emails/${encodeURIComponent(email)}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return alert(data.error || 'Failed to remove reminder email.');
        setFormData(prev => ({ ...prev, ...data, reminderEmails: normalizeEmails(data.reminderEmails) }));
    };

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
            setFormData(prev => ({ ...prev, ...savedData, reminderEmails: normalizeEmails(savedData.reminderEmails) }));
            
            alert("Company Profile saved successfully!");
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
                    {isSuperAdmin && <FormGroup label="Company Key" name="tenantKey" value={formData.tenantKey} onChange={handleChange} />}
                    <FormGroup label="Logistics Company Name" name="companyName" value={formData.companyName} onChange={handleChange} required />
                    <FormGroup label="GSTIN Number" name="gstNumber" value={formData.gstNumber} onChange={handleChange} />
                    <FormGroup label="PAN Number" name="panNumber" value={formData.panNumber} onChange={handleChange} />
                    <FormGroup label="Phone Number" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} />
                    <FormGroup label="Business Email" name="email" value={formData.email} onChange={handleChange} />
                    <div style={{ gridColumn: '1 / -1' }}>
                        <FormGroup label="Full Registered Address" name="address" value={formData.address} onChange={handleChange} multiline />
                    </div>
                </div>

                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>2. Bank & Payment Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                    <FormGroup label="Bank Name" name="bankName" value={formData.bankName} onChange={handleChange} />
                    <FormGroup label="Account Number" name="accountNumber" value={formData.accountNumber} onChange={handleChange} />
                    <FormGroup label="IFSC Code" name="ifscCode" value={formData.ifscCode} onChange={handleChange} />
                    <FormGroup label="Bank Branch" name="bankBranch" value={formData.bankBranch} onChange={handleChange} />
                    <FormGroup label="Beneficiary Name" name="beneficiaryName" value={formData.beneficiaryName} onChange={handleChange} />
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
                    <FormGroup label="Signatory Name" name="signatoryName" value={formData.signatoryName} onChange={handleChange} />
                </div>

                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>4. Invoice Declarations</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
                    <FormGroup label="Rule 48(4) Declaration" name="rule48Declaration" value={formData.rule48Declaration} onChange={handleChange} multiline />
                    <FormGroup label="GTA Forward-Charge Declaration" name="gtaDeclaration" value={formData.gtaDeclaration} onChange={handleChange} multiline />
                </div>

                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>5. Reminder Emails</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '25px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            value={newReminderEmail}
                            onChange={e => setNewReminderEmail(e.target.value)}
                            placeholder="person@company.com"
                            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px', minWidth: '260px' }}
                        />
                        <button type="button" onClick={addReminderEmail} style={{ padding: '8px 12px', backgroundColor: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Add Mail ID
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {normalizeEmails(formData.reminderEmails).length === 0 && <span style={{ color: '#64748b', fontSize: '13px' }}>No reminder mail IDs added.</span>}
                        {normalizeEmails(formData.reminderEmails).map(email => (
                            <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc', fontSize: '13px' }}>
                                {email}
                                <button type="button" onClick={() => removeReminderEmail(email)} style={{ border: 0, background: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 800 }}>x</button>
                            </span>
                        ))}
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
