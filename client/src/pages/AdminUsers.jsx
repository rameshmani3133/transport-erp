import React, { useEffect, useMemo, useState } from 'react';

const emptyUser = { name: '', email: '', password: '', role: 'USER', status: 'Active', companies: [] };
const emptyCompany = { id: null, tenantKey: '', companyName: '', gstNumber: '', panNumber: '', address: '' };

function profileScore(profile) {
  const isPlaceholder = String(profile.companyName || '').trim().toLowerCase() === 'default company';
  const filledFields = ['gstNumber', 'panNumber', 'address', 'bankName', 'accountNumber']
    .filter(field => String(profile[field] || '').trim()).length;
  return (isPlaceholder ? 0 : 10) + filledFields;
}

function uniqueProfiles(profiles) {
  const byTenant = new Map();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!profile?.tenantKey) continue;
    const current = byTenant.get(profile.tenantKey);
    if (!current || profileScore(profile) > profileScore(current)) {
      byTenant.set(profile.tenantKey, profile);
    }
  }
  return Array.from(byTenant.values()).sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
}

export default function AdminUsers({ profiles = [], onCompaniesChanged }) {
  const companyProfiles = useMemo(() => uniqueProfiles(profiles), [profiles]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [backups, setBackups] = useState([]);
  const [form, setForm] = useState(emptyUser);
  const [companyForm, setCompanyForm] = useState(emptyCompany);
  const [editingId, setEditingId] = useState(null);
  const [editingCompanyKey, setEditingCompanyKey] = useState(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    const [usersRes, logsRes, backupsRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/audit-logs'),
      fetch('/api/admin/backups'),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (logsRes.ok) setLogs(await logsRes.json());
    if (backupsRes.ok) setBackups(await backupsRes.json());
  };

  useEffect(() => { load().catch(() => setMessage('Failed to load admin data.')); }, []);

  const toggleCompany = (tenantKey) => {
    setForm(prev => ({
      ...prev,
      companies: prev.companies.includes(tenantKey)
        ? prev.companies.filter(key => key !== tenantKey)
        : [...prev.companies, tenantKey],
    }));
  };

  const refreshCompanies = async () => {
    await onCompaniesChanged?.();
    await load();
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    const url = editingId ? `/api/admin/users/${editingId}` : '/api/admin/users';
    const method = editingId ? 'PUT' : 'POST';
    const payload = { ...form };
    if (editingId && !payload.password) delete payload.password;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || 'Failed to save user.');
    setForm(emptyUser);
    setEditingId(null);
    setMessage('User saved.');
    await load();
  };

  const saveCompany = async (event) => {
    event.preventDefault();
    setMessage('');
    const url = editingCompanyKey ? `/api/my-company/profile/${companyForm.id}` : '/api/my-company';
    const method = editingCompanyKey ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyForm),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || 'Failed to save company.');
    setCompanyForm(emptyCompany);
    setEditingCompanyKey(null);
    setMessage(`Company saved: ${data.companyName}`);
    await refreshCompanies();
  };

  const editUser = (user) => {
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email, password: '', role: user.role, status: user.status, companies: user.companies || [] });
  };

  const editCompany = (profile) => {
    setEditingCompanyKey(profile.tenantKey);
    setCompanyForm({
      id: profile.id || null,
      tenantKey: profile.tenantKey || '',
      companyName: profile.companyName || '',
      gstNumber: profile.gstNumber || '',
      panNumber: profile.panNumber || '',
      address: profile.address || '',
    });
  };

  const cancelCompanyEdit = () => {
    setEditingCompanyKey(null);
    setCompanyForm(emptyCompany);
  };

  const deleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) return setMessage('Failed to delete user.');
    await load();
  };

  const deleteCompany = async (tenantKey) => {
    const profile = companyProfiles.find(item => item.tenantKey === tenantKey);
    if (!profile) return setMessage('Company not found.');
    if (!confirm(`Delete company ${tenantKey}? Users assigned to it will lose access.`)) return;
    const res = await fetch(`/api/my-company/profile/${profile.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || 'Failed to delete company.');
    if (editingCompanyKey === tenantKey) cancelCompanyEdit();
    setForm(prev => ({ ...prev, companies: prev.companies.filter(key => key !== tenantKey) }));
    setMessage('Company deleted.');
    await refreshCompanies();
  };

  const runBackup = async () => {
    setMessage('Running backup...');
    const res = await fetch('/api/admin/backups/run', { method: 'POST' });
    const data = await res.json();
    setMessage(res.ok ? `Backup saved: ${data.localPath}` : data.error || 'Backup failed.');
    await load();
  };

  return (
    <div className="admin-page">
      <div className="page-header-row">
        <h2>Superadmin Console</h2>
        <button className="primary-btn" onClick={runBackup}>Run Backup</button>
      </div>
      {message && <div className="status-banner">{message}</div>}

      <section className="admin-grid">
        <form className="admin-panel" onSubmit={submit}>
          <h3>{editingId ? 'Edit User' : 'Create User'}</h3>
          <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required disabled={!!editingId} />
          <input placeholder={editingId ? 'New password optional' : 'Password'} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!editingId} />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="USER">User</option>
            <option value="SUPERADMIN">Superadmin</option>
          </select>
          <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <div className="company-checks">
            {companyProfiles.map(profile => (
              <label key={profile.tenantKey}>
                <input type="checkbox" checked={form.companies.includes(profile.tenantKey)} onChange={() => toggleCompany(profile.tenantKey)} />
                <span>{profile.companyName || profile.tenantKey}</span>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="primary-btn" type="submit">Save User</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyUser); }}>Cancel</button>}
          </div>
        </form>

        <div className="admin-panel">
          <h3>Users</h3>
          <div className="compact-list">
            {users.map(user => (
              <div className="compact-row" key={user.id}>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email} | {user.role} | {user.status}</span>
                  <small>{(user.companies || []).join(', ') || 'No companies assigned'}</small>
                </div>
                <button onClick={() => editUser(user)}>Edit</button>
                <button className="danger-text" onClick={() => deleteUser(user.id)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-grid">
        <form className="admin-panel" onSubmit={saveCompany}>
          <h3>{editingCompanyKey ? 'Edit Company' : 'Create Company'}</h3>
          <input placeholder="Company Key" value={companyForm.tenantKey} onChange={e => setCompanyForm({ ...companyForm, tenantKey: e.target.value })} required disabled={!!editingCompanyKey} />
          <input placeholder="Company Name" value={companyForm.companyName} onChange={e => setCompanyForm({ ...companyForm, companyName: e.target.value })} required />
          <input placeholder="GST Number" value={companyForm.gstNumber} onChange={e => setCompanyForm({ ...companyForm, gstNumber: e.target.value })} />
          <input placeholder="PAN Number" value={companyForm.panNumber} onChange={e => setCompanyForm({ ...companyForm, panNumber: e.target.value })} />
          <input placeholder="Address" value={companyForm.address} onChange={e => setCompanyForm({ ...companyForm, address: e.target.value })} />
          <div className="form-actions">
            <button className="primary-btn" type="submit">Save Company</button>
            {editingCompanyKey && <button type="button" onClick={cancelCompanyEdit}>Cancel</button>}
          </div>
        </form>

        <div className="admin-panel">
          <h3>Companies</h3>
          <div className="compact-list">
            {companyProfiles.map(profile => (
              <div className="compact-row" key={profile.tenantKey}>
                <div>
                  <strong>{profile.companyName || profile.tenantKey}</strong>
                  <span>{profile.tenantKey}</span>
                  <small>{profile.gstNumber || profile.panNumber || 'No tax details saved'}</small>
                </div>
                <button onClick={() => editCompany(profile)}>Edit</button>
                <button className="danger-text" onClick={() => deleteCompany(profile.tenantKey)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <h3>Backup Runs</h3>
        <div className="compact-list">
          {backups.map(run => (
            <div className="compact-row" key={run.id}>
              <div>
                <strong>{run.status}</strong>
                <span>{new Date(run.createdAt).toLocaleString()}</span>
                <small>{run.localPath}{run.cloudPath ? ` | Cloud: ${run.cloudPath}` : ''}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <h3>Recent Audit Logs</h3>
        <div className="compact-list">
          {logs.map(log => (
            <div className="compact-row" key={log.id}>
              <div>
                <strong>{log.action}</strong>
                <span>{log.user?.email || 'system'} | {log.tenantKey || 'global'} | {new Date(log.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
