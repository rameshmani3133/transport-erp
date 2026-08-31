import React, { useEffect, useMemo, useState } from 'react';

const emptyUser = { name: '', email: '', password: '', role: 'USER', status: 'Active', companies: [] };
const emptyCompany = { id: null, tenantKey: '', companyName: '', gstNumber: '', panNumber: '', address: '' };
const emptyBackupEdit = { status: 'Success', message: '' };
const emptyLogEdit = { action: '', tenantKey: '', entity: '', entityId: '', ipAddress: '', details: '' };

function dateText(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

async function readJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const body = await response.text();
  return { error: body && body.length < 300 ? body : 'The server returned an unexpected response.' };
}

async function downloadExport(url, fileName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Export failed.');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  document.body.removeChild(link);
}

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
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [backups, setBackups] = useState([]);
  const [deletedCompanies, setDeletedCompanies] = useState([]);
  const [form, setForm] = useState(emptyUser);
  const [companyForm, setCompanyForm] = useState(emptyCompany);
  const [editingId, setEditingId] = useState(null);
  const [editingCompanyKey, setEditingCompanyKey] = useState(null);
  const [editingBackupId, setEditingBackupId] = useState(null);
  const [backupForm, setBackupForm] = useState(emptyBackupEdit);
  const [editingLogId, setEditingLogId] = useState(null);
  const [logForm, setLogForm] = useState(emptyLogEdit);
  const [message, setMessage] = useState('');

  const load = async () => {
    const [usersRes, deletedUsersRes, logsRes, backupsRes, deletedCompaniesRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/users/deleted'),
      fetch('/api/admin/audit-logs'),
      fetch('/api/admin/backups'),
      fetch('/api/my-company/deleted/all'),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (deletedUsersRes.ok) setDeletedUsers(await deletedUsersRes.json());
    if (logsRes.ok) setLogs(await logsRes.json());
    if (backupsRes.ok) setBackups(await backupsRes.json());
    if (deletedCompaniesRes.ok) setDeletedCompanies(await deletedCompaniesRes.json());
  };

  useEffect(() => { load().catch(() => setMessage('Failed to load admin data.')); }, []);

  const refreshCompanies = async () => {
    await onCompaniesChanged?.();
    await load();
  };

  const toggleCompany = (tenantKey) => {
    setForm(prev => ({
      ...prev,
      companies: prev.companies.includes(tenantKey)
        ? prev.companies.filter(key => key !== tenantKey)
        : [...prev.companies, tenantKey],
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    const url = editingId ? `/api/admin/users/${editingId}` : '/api/admin/users';
    const method = editingId ? 'PUT' : 'POST';
    const payload = { ...form };
    if (editingId && !payload.password) delete payload.password;
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await readJsonResponse(res);
      if (!res.ok) return setMessage(data.error || 'Failed to save user.');
      setForm(emptyUser);
      setEditingId(null);
      setMessage(editingId ? 'User updated.' : 'User created.');
      await load();
    } catch (error) {
      setMessage(error.message || 'Failed to save user.');
    }
  };

  const saveCompany = async (event) => {
    event.preventDefault();
    setMessage('');
    const url = editingCompanyKey ? `/api/my-company/profile/${companyForm.id}` : '/api/my-company';
    const method = editingCompanyKey ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(companyForm) });
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
    if (!confirm('Move this user to the recycle bin?')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await readJsonResponse(res);
    if (!res.ok) return setMessage(data.error || 'Failed to delete user.');
    setMessage('User moved to recycle bin.');
    await load();
  };

  const restoreUser = async (user) => {
    const res = await fetch(`/api/admin/users/${user.id}/restore`, { method: 'PATCH' });
    const data = await readJsonResponse(res);
    if (!res.ok) return setMessage(data.error || 'Failed to restore user.');
    setMessage(`User restored: ${data.email}`);
    await load();
  };

  const permanentlyDeleteUser = async (user) => {
    if (!confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${user.id}/permanent`, { method: 'DELETE' });
    const data = await readJsonResponse(res);
    if (!res.ok) return setMessage(data.error || 'Failed to permanently delete user.');
    setMessage('User permanently deleted.');
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
    setMessage('Company moved to recycle bin.');
    await refreshCompanies();
  };

  const restoreCompany = async (profile) => {
    const res = await fetch(`/api/my-company/profile/${profile.id}/restore`, { method: 'PATCH' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || 'Failed to restore company.');
    setMessage(`Company restored: ${data.companyName}`);
    await refreshCompanies();
  };

  const permanentlyDeleteCompany = async (profile) => {
    if (!confirm(`Permanently delete ${profile.companyName || profile.tenantKey}? This cannot be undone.`)) return;
    const res = await fetch(`/api/my-company/profile/${profile.id}/permanent`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || 'Failed to permanently delete company.');
    setMessage('Company permanently deleted.');
    await refreshCompanies();
  };

  const runBackup = async () => {
    setMessage('Running backup...');
    const res = await fetch('/api/admin/backups/run', { method: 'POST' });
    const data = await res.json();
    setMessage(res.ok ? `Backup saved: ${data.localPath}` : data.error || 'Backup failed.');
    await load();
  };

  const editBackup = (run) => {
    setEditingBackupId(run.id);
    setBackupForm({ status: run.status || 'Success', message: run.message || '' });
  };

  const saveBackup = async (event) => {
    event.preventDefault();
    const res = await fetch(`/api/admin/backups/${editingBackupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupForm),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || 'Failed to update backup.');
    setEditingBackupId(null);
    setBackupForm(emptyBackupEdit);
    setMessage('Backup updated.');
    await load();
  };

  const deleteBackup = async (run) => {
    if (!confirm(`Delete backup #${run.id}? This will also remove its local/cloud backup files when available.`)) return;
    const res = await fetch(`/api/admin/backups/${run.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || 'Failed to delete backup.');
    if (editingBackupId === run.id) {
      setEditingBackupId(null);
      setBackupForm(emptyBackupEdit);
    }
    setMessage('Backup deleted.');
    await load();
  };

  const exportBackups = async () => {
    try {
      await downloadExport('/api/admin/backups/export', `backup-runs-${Date.now()}.csv`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const editLog = (log) => {
    setEditingLogId(log.id);
    setLogForm({
      action: log.action || '',
      tenantKey: log.tenantKey || '',
      entity: log.entity || '',
      entityId: log.entityId || '',
      ipAddress: log.ipAddress || '',
      details: log.details ? JSON.stringify(log.details, null, 2) : '',
    });
  };

  const saveLog = async (event) => {
    event.preventDefault();
    const res = await fetch(`/api/admin/audit-logs/${editingLogId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logForm),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || 'Failed to update audit log.');
    setEditingLogId(null);
    setLogForm(emptyLogEdit);
    setMessage('Audit log updated.');
    await load();
  };

  const deleteLog = async (log) => {
    if (!confirm(`Delete audit log #${log.id}?`)) return;
    const res = await fetch(`/api/admin/audit-logs/${log.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || 'Failed to delete audit log.');
    if (editingLogId === log.id) {
      setEditingLogId(null);
      setLogForm(emptyLogEdit);
    }
    setMessage('Audit log deleted.');
    await load();
  };

  const exportLogs = async () => {
    try {
      await downloadExport('/api/admin/audit-logs/export', `audit-logs-${Date.now()}.csv`);
    } catch (error) {
      setMessage(error.message);
    }
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
          <input placeholder={editingId ? 'New password optional' : 'Password'} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!editingId} minLength={form.password || !editingId ? 10 : undefined} />
          <small>{editingId ? 'Leave blank to keep the current password; a new password needs at least 10 characters.' : 'Password must contain at least 10 characters.'}</small>
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

      <section className="admin-panel">
        <h3>User Recycle Bin</h3>
        <div className="compact-list">
          {deletedUsers.length === 0 && <div className="empty-state">No deleted users.</div>}
          {deletedUsers.map(user => (
            <div className="compact-row" key={user.id}>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email} | Deleted {dateText(user.deletedAt)}</span>
                <small>{(user.companies || []).join(', ') || 'No companies assigned'}</small>
              </div>
              <button onClick={() => restoreUser(user)}>Restore</button>
              <button className="danger-text" onClick={() => permanentlyDeleteUser(user)}>Permanent Delete</button>
            </div>
          ))}
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
        <h3>Company Recycle Bin</h3>
        <div className="compact-list">
          {deletedCompanies.length === 0 && <div className="empty-state">No deleted companies.</div>}
          {deletedCompanies.map(profile => (
            <div className="compact-row" key={profile.id}>
              <div>
                <strong>{profile.companyName || profile.tenantKey}</strong>
                <span>{profile.tenantKey} | Deleted {new Date(profile.deletedAt).toLocaleString()}</span>
                <small>{profile.gstNumber || profile.panNumber || 'No tax details saved'}</small>
              </div>
              <button onClick={() => restoreCompany(profile)}>Restore</button>
              <button className="danger-text" onClick={() => permanentlyDeleteCompany(profile)}>Permanent Delete</button>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="page-header-row">
          <h3>Backup Runs</h3>
          <button type="button" onClick={exportBackups}>Export Backups</button>
        </div>
        {editingBackupId && (
          <form className="inline-edit-form" onSubmit={saveBackup}>
            <select value={backupForm.status} onChange={e => setBackupForm({ ...backupForm, status: e.target.value })}>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
              <option value="Archived">Archived</option>
            </select>
            <input placeholder="Message" value={backupForm.message} onChange={e => setBackupForm({ ...backupForm, message: e.target.value })} />
            <button className="primary-btn" type="submit">Save Backup</button>
            <button type="button" onClick={() => { setEditingBackupId(null); setBackupForm(emptyBackupEdit); }}>Cancel</button>
          </form>
        )}
        <div className="compact-list">
          {backups.length === 0 && <div className="empty-state">No backup runs.</div>}
          {backups.map(run => (
            <div className="compact-row" key={run.id}>
              <div>
                <strong>{run.status}</strong>
                <span>{dateText(run.createdAt)}</span>
                <small>{run.localPath || 'No local file'}{run.cloudPath ? ` | Cloud: ${run.cloudPath}` : ''}</small>
                {run.message && <small>{run.message}</small>}
              </div>
              <button onClick={() => editBackup(run)}>Edit</button>
              <button className="danger-text" onClick={() => deleteBackup(run)}>Delete</button>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="page-header-row">
          <h3>Recent Audit Logs</h3>
          <button type="button" onClick={exportLogs}>Export Logs</button>
        </div>
        {editingLogId && (
          <form className="inline-edit-form log-edit-form" onSubmit={saveLog}>
            <input placeholder="Action" value={logForm.action} onChange={e => setLogForm({ ...logForm, action: e.target.value })} required />
            <input placeholder="Tenant" value={logForm.tenantKey} onChange={e => setLogForm({ ...logForm, tenantKey: e.target.value })} />
            <input placeholder="Entity" value={logForm.entity} onChange={e => setLogForm({ ...logForm, entity: e.target.value })} />
            <input placeholder="Entity ID" value={logForm.entityId} onChange={e => setLogForm({ ...logForm, entityId: e.target.value })} />
            <input placeholder="IP Address" value={logForm.ipAddress} onChange={e => setLogForm({ ...logForm, ipAddress: e.target.value })} />
            <textarea placeholder="Details JSON" value={logForm.details} onChange={e => setLogForm({ ...logForm, details: e.target.value })} rows={4} />
            <button className="primary-btn" type="submit">Save Log</button>
            <button type="button" onClick={() => { setEditingLogId(null); setLogForm(emptyLogEdit); }}>Cancel</button>
          </form>
        )}
        <div className="compact-list">
          {logs.length === 0 && <div className="empty-state">No audit logs.</div>}
          {logs.map(log => (
            <div className="compact-row" key={log.id}>
              <div>
                <strong>{log.action}</strong>
                <span>{log.user?.email || 'system'} | {log.tenantKey || 'global'} | {dateText(log.createdAt)}</span>
                <small>{log.entity || 'No entity'}{log.entityId ? ` #${log.entityId}` : ''}{log.ipAddress ? ` | ${log.ipAddress}` : ''}</small>
              </div>
              <button onClick={() => editLog(log)}>Edit</button>
              <button className="danger-text" onClick={() => deleteLog(log)}>Delete</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
