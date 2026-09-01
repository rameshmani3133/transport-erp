import React, { useEffect, useState } from 'react';

const dateText = value => value ? new Date(value).toLocaleString() : '-';

export default function TableRecycleBin({ type, title, onClose, onChanged }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/recycle-bin?type=${encodeURIComponent(type)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(data.error || 'Failed to load deleted records.');
    else setRecords(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [type]);

  const act = async (record, action) => {
    const permanent = action === 'permanent';
    const prompt = permanent
      ? `Permanently delete ${record.title}? This cannot be undone.`
      : `Restore ${record.title}?`;
    if (!confirm(prompt)) return;
    const res = await fetch(`/api/recycle-bin/${record.type}/${record.id}/${action}`, { method: permanent ? 'DELETE' : 'PATCH' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || `Failed to ${permanent ? 'delete' : 'restore'} record.`);
    setMessage(data.message || 'Completed.');
    await load();
    onChanged?.();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
      <div style={{ width: 'min(900px, 100%)', maxHeight: '90vh', overflow: 'auto', background: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}>
        <div className="page-header-row">
          <div><h3 style={{ margin: 0 }}>{title} Recycle Bin</h3><small>Only deleted records for the selected company are shown.</small></div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        {message && <div className="status-banner" style={{ margin: '12px 0' }}>{message}</div>}
        <div className="compact-list" style={{ marginTop: '14px' }}>
          {loading && <div className="empty-state">Loading...</div>}
          {!loading && !records.length && <div className="empty-state">No deleted records.</div>}
          {records.map(record => (
            <div className="compact-row" key={`${record.type}-${record.id}`}>
              <div>
                <strong>{record.title || `Record #${record.id}`}</strong>
                <span>Deleted {dateText(record.deletedAt)} | ID: {record.id}</span>
                <details><summary style={{ cursor: 'pointer', fontSize: '12px' }}>Review data</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '12px' }}>{JSON.stringify(record, null, 2)}</pre></details>
              </div>
              <button type="button" onClick={() => act(record, 'restore')}>Restore</button>
              <button type="button" className="danger-text" onClick={() => act(record, 'permanent')}>Permanent Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
