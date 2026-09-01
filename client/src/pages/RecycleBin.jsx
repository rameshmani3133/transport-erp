import React, { useEffect, useState } from 'react';

const dateText = value => value ? new Date(value).toLocaleString() : '-';

export default function RecycleBin() {
  const [types, setTypes] = useState([]);
  const [type, setType] = useState('all');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = async (selectedType = type) => {
    setLoading(true);
    setMessage('');
    try {
      const [typesRes, recordsRes] = await Promise.all([
        fetch('/api/recycle-bin/types'),
        fetch(`/api/recycle-bin?type=${encodeURIComponent(selectedType)}`),
      ]);
      const typesData = await typesRes.json().catch(() => []);
      const recordsData = await recordsRes.json().catch(() => ({}));
      if (!recordsRes.ok) throw new Error(recordsData.error || 'Failed to load recycle bin.');
      if (typesRes.ok) setTypes(typesData);
      setRecords(Array.isArray(recordsData) ? recordsData : []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(type); }, [type]);

  const restore = async record => {
    if (!confirm(`Restore ${record.title || `record #${record.id}`}?`)) return;
    const res = await fetch(`/api/recycle-bin/${record.type}/${record.id}/restore`, { method: 'PATCH' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || 'Failed to restore record.');
    setMessage(data.message || 'Record restored.');
    await load(type);
  };

  const permanentDelete = async record => {
    if (!confirm(`Permanently delete ${record.title || `record #${record.id}`}? This cannot be undone.`)) return;
    const res = await fetch(`/api/recycle-bin/${record.type}/${record.id}/permanent`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || 'Failed to permanently delete record.');
    setMessage(data.message || 'Record permanently deleted.');
    await load(type);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1500px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a' }}>Recycle Bin</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Review, restore, or permanently delete soft-deleted records.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select value={type} onChange={event => setType(event.target.value)} style={{ padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white' }}>
            <option value="all">All tables</option>
            {types.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <button type="button" onClick={() => load(type)} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: 800 }}>Refresh</button>
        </div>
      </div>

      {message && <div className="status-banner" style={{ marginBottom: '14px' }}>{message}</div>}

      <section className="admin-panel">
        <div className="page-header-row">
          <h3>Deleted Records</h3>
          <strong>{records.length}</strong>
        </div>
        {loading ? <div className="empty-state">Loading deleted records...</div> : (
          <div className="compact-list">
            {!records.length && <div className="empty-state">No deleted records for this selection.</div>}
            {records.map(record => {
              const details = Object.fromEntries(Object.entries(record).filter(([key]) => !['type', 'typeLabel', 'title'].includes(key)));
              return (
                <div className="compact-row" key={`${record.type}-${record.id}`}>
                  <div>
                    <strong>{record.title || `Record #${record.id}`}</strong>
                    <span>{record.typeLabel} | Deleted {dateText(record.deletedAt)}</span>
                    <small>Company: {record.tenantKey || 'Global'} | ID: {record.id}</small>
                    <details style={{ marginTop: '6px' }}>
                      <summary style={{ cursor: 'pointer', color: '#475569', fontSize: '12px', fontWeight: 700 }}>Review data</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>{JSON.stringify(details, null, 2)}</pre>
                    </details>
                  </div>
                  <button type="button" onClick={() => restore(record)}>Restore</button>
                  <button type="button" className="danger-text" onClick={() => permanentDelete(record)}>Permanent Delete</button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
