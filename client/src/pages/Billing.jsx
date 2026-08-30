import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';

export default function Billing() {
  const [invoices, setInvoices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [allUnbilledTrips, setAllUnbilledTrips] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedTripIds, setSelectedTripIds] = useState([]);

  // --- New Feature States ---
  const [gstType, setGstType] = useState('CGST_SGST');
  const [gstPercent, setGstPercent] = useState(18); // Default 18%
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterFromLoc, setFilterFromLoc] = useState('');
  const [filterToLoc, setFilterToLoc] = useState('');

  const initialState = {
      date: new Date().toISOString().split('T')[0],
      dueDate: '',
      locationId: '',
      clientAccountId: '',
      incomeAccountId: '',
      subTotal: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      otherCharges: 0,
      grandTotal: 0
  };
  
  const [formData, setFormData] = useState(initialState);

  const fetchData = async () => {
      try {
          const [invRes, locRes, tripRes, accRes] = await Promise.all([
              fetch('/api/invoices'),
              fetch('/api/locations'),
              fetch('/api/trips'),
              fetch('/api/ledger/accounts')
          ]);
          
          if (invRes.ok) setInvoices(await invRes.json());
          if (locRes.ok) setLocations(await locRes.json());
          if (accRes.ok) setAccounts(await accRes.json());
          
          if (tripRes.ok) {
              const allTrips = await tripRes.json();
              setAllUnbilledTrips(allTrips.filter(t => !t.invoiceId));
          }
      } catch (err) {
          console.error("Error fetching billing data:", err);
      }
  };

  useEffect(() => { fetchData(); }, []);

  // SMART FILTER: Apply Company, Date Range, and Route Location filters
  const selectedLocation = locations.find(l => l.id.toString() === formData.locationId);
  const displayTrips = allUnbilledTrips.filter(t => {
      if (selectedLocation && t.companyId !== selectedLocation.companyId) return false;
      if (!selectedLocation) return true; 
      
      const tDate = new Date(t.date);
      if (filterStartDate && tDate < new Date(filterStartDate)) return false;
      if (filterEndDate && tDate > new Date(filterEndDate)) return false;

      if (filterFromLoc && !t.route?.fromLocation?.toLowerCase().includes(filterFromLoc.toLowerCase())) return false;
      if (filterToLoc && !t.route?.toLocation?.toLowerCase().includes(filterToLoc.toLowerCase())) return false;

      return true;
  });

  const allDisplayedSelected = displayTrips.length > 0 && displayTrips.every(t => selectedTripIds.includes(t.id));

  const handleSelectAll = (e) => {
      if (e.target.checked) {
          const newIds = displayTrips.map(t => t.id);
          setSelectedTripIds(Array.from(new Set([...selectedTripIds, ...newIds])));
      } else {
          const displayIds = displayTrips.map(t => t.id);
          setSelectedTripIds(selectedTripIds.filter(id => !displayIds.includes(id)));
      }
  };

  const handleTripToggle = (tripId) => {
      setSelectedTripIds(prev => prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]);
  };

  useEffect(() => {
      const subTotal = selectedTripIds.reduce((sum, id) => {
          const trip = allUnbilledTrips.find(t => t.id === parseInt(id));
          return sum + (trip ? (parseFloat(trip.totalClientBill) || 0) : 0);
      }, 0);
      
      const rate = parseFloat(gstPercent) || 0;
      let cgst = 0, sgst = 0, igst = 0;

      if (gstType === 'CGST_SGST') {
          cgst = subTotal * (rate / 2) / 100;
          sgst = subTotal * (rate / 2) / 100;
      } else {
          igst = subTotal * rate / 100;
      }

      const otherCharges = parseFloat(formData.otherCharges || 0);
      const grandTotal = subTotal + cgst + sgst + igst + otherCharges;

      setFormData(prev => ({ ...prev, subTotal, cgst, sgst, igst, grandTotal }));
  }, [selectedTripIds, formData.otherCharges, gstType, gstPercent, allUnbilledTrips]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
      e.preventDefault();
      if (!formData.clientAccountId || !formData.incomeAccountId) return alert("Please select both a Client and Income Account.");
      if (selectedTripIds.length === 0) return alert("Please select at least one trip to bill.");

      try {
          const payload = { ...formData, tripIds: selectedTripIds };
          const response = await fetch('/api/invoices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          const text = await response.text();
          const data = text ? JSON.parse(text) : {};
          if (!response.ok) throw new Error(data.error);

          alert("Invoice Generated & Ledger Updated Successfully!");
          setFormData(initialState);
          setSelectedTripIds([]);
          setFilterStartDate(''); setFilterEndDate(''); setFilterFromLoc(''); setFilterToLoc('');
          fetchData();
      } catch (error) { alert(error.message); }
  };

  const handleDelete = async (id) => {
      if (!(await window.confirmSnackbar("Are you sure? This will delete the invoice, release the trips, and reverse the ledger entries."))) return;
      try {
          await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
          fetchData();
      } catch (error) { alert(error.message); }
  };

  const columns = [
      { header: 'Invoice No', key: 'invoiceNo', render: (inv) => <strong>{inv.invoiceNo}</strong> },
      { header: 'Date', key: 'date', render: (inv) => new Date(inv.date).toLocaleDateString() },
      { header: 'Location', key: 'location', render: (inv) => inv.location?.locationName || 'N/A' },
      { header: 'Total Amount', key: 'grandTotal', render: (inv) => <span style={{color:'#16a34a', fontWeight:'bold'}}>₹{inv.grandTotal?.toFixed(2)}</span> },
      { header: 'Status', key: 'status', render: (inv) => <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: inv.status === 'Paid' ? '#dcfce7' : '#fee2e2', color: inv.status === 'Paid' ? '#16a34a' : '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>{inv.status}</span> },
      { header: 'Actions', key: 'actions', render: (inv) => (
          <div style={{ display: 'flex', gap: '10px' }}>
              <a href={`/print-invoice/${inv.id}`} target="_blank" rel="noopener noreferrer" style={{color:'#3b82f6', textDecoration:'none', fontWeight:'bold'}}>Print</a>
              <button onClick={() => handleDelete(inv.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Delete</button>
          </div>
      )}
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Billing & Invoicing</h2>

      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
          
          <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>1. Invoice & Ledger Mapping</h3>
          
          <div style={{ backgroundColor: '#eff6ff', padding: '15px', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '20px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#1d4ed8' }}>
                  <strong>Accounting Note:</strong> Generating this invoice will automatically <strong>Debit</strong> the Client (recording that they owe you money) and <strong>Credit</strong> the Sales Account (recording your freight revenue).
              </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Billing Location</label>
                  <select name="locationId" value={formData.locationId} onChange={(e) => { handleChange(e); setSelectedTripIds([]); }} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}>
                      <option value="">-- Select Location --</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.locationName} ({l.company?.companyName})</option>)}
                  </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#1d4ed8' }}>Client Account (Debtor / Owes You) - Dr</label>
                  <select name="clientAccountId" value={formData.clientAccountId} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', fontSize:'13px' }}>
                      <option value="">-- Select Client Debtor --</option>
                      {accounts.filter(a => a.accountGroup?.includes('Sundry Debtors')).map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#16a34a' }}>Income Account (Sales / Revenue) - Cr</label>
                  <select name="incomeAccountId" value={formData.incomeAccountId} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', fontSize:'13px' }}>
                      <option value="">-- Select Freight Income --</option>
                      {accounts.filter(a => a.accountGroup?.includes('Direct Income') || a.accountType === 'Income').map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Invoice Date</label>
                  <input type="date" name="date" value={formData.date} onChange={handleChange} required style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px' }} />
              </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '14px', color: '#334155', margin: 0 }}>
                  2. Select Unbilled Trips {selectedLocation ? `for ${selectedLocation.company?.companyName}` : ''}
              </h3>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#3b82f6', backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '4px' }}>
                  Total Selected Trips: {selectedTripIds.length}
              </span>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Start Date</label>
                  <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'12px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>End Date</label>
                  <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'12px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>From Location</label>
                  <input type="text" placeholder="e.g. Mumbai" value={filterFromLoc} onChange={e => setFilterFromLoc(e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'12px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>To Location</label>
                  <input type="text" placeholder="e.g. Delhi" value={filterToLoc} onChange={e => setFilterToLoc(e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'12px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="button" onClick={() => {setFilterStartDate(''); setFilterEndDate(''); setFilterFromLoc(''); setFilterToLoc('');}} style={{ padding: '7px 12px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize:'12px', fontWeight:'bold' }}>Clear Filters</button>
              </div>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '25px', backgroundColor: '#f8fafc' }}>
              {displayTrips.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px 0' }}>
                      {formData.locationId ? "No unbilled trips found matching filters." : "Please select a Billing Location to view unbilled trips."}
                  </p>
              ) : (
                  <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'white' }}>
                      <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                              <th style={{ padding: '10px' }}>
                                  <input type="checkbox" checked={allDisplayedSelected} onChange={handleSelectAll} style={{ cursor: 'pointer' }} title="Select all filtered trips" />
                              </th>
                              <th style={{ padding: '10px' }}>Trip No</th>
                              <th style={{ padding: '10px' }}>Date</th>
                              <th style={{ padding: '10px' }}>Route</th>
                              <th style={{ padding: '10px' }}>Dim (LxWxH)</th>
                              <th style={{ padding: '10px' }}>Halt (₹)</th>
                              <th style={{ padding: '10px' }}>ODC (₹)</th>
                              <th style={{ padding: '10px', textAlign: 'right' }}>Total Bill (₹)</th>
                          </tr>
                      </thead>
                      <tbody>
                          {displayTrips.map(trip => (
                              <tr key={trip.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: selectedTripIds.includes(trip.id) ? '#f0f9ff' : 'white' }}>
                                  <td style={{ padding: '10px' }}>
                                      <input type="checkbox" checked={selectedTripIds.includes(trip.id)} onChange={() => handleTripToggle(trip.id)} style={{ cursor: 'pointer' }} />
                                  </td>
                                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>{trip.tripNo}</td>
                                  <td style={{ padding: '10px' }}>{new Date(trip.date).toLocaleDateString()}</td>
                                  <td style={{ padding: '10px', color: '#64748b' }}>{trip.route?.fromLocation} ➔ {trip.route?.toLocation}</td>
                                  
                                  {/* NEW COLUMNS ADDED HERE */}
                                  <td style={{ padding: '10px' }}>{trip.length || '-'} x {trip.width || '-'} x {trip.height || '-'}</td>
                                  <td style={{ padding: '10px' }}>{trip.clientHaltingCharge || 0}</td>
                                  <td style={{ padding: '10px' }}>{trip.clientExtraSizeCharge || 0}</td>

                                  <td style={{ padding: '10px', color: '#16a34a', fontWeight: 'bold', textAlign: 'right' }}>₹{trip.totalClientBill}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              )}
          </div>

          <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>3. Taxes & Adjustments</h3>
          
          <div style={{ display: 'flex', gap: '15px', backgroundColor: '#fff7ed', padding: '15px', borderRadius: '8px', border: '1px solid #fed7aa', marginBottom: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#c2410c' }}>Tax Type</label>
                  <select value={gstType} onChange={e => setGstType(e.target.value)} style={{ padding: '8px', border: '1px solid #fdba74', borderRadius: '4px', fontSize:'13px' }}>
                      <option value="CGST_SGST">CGST & SGST (Local)</option>
                      <option value="IGST">IGST (Inter-State)</option>
                  </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#c2410c' }}>Total GST Percentage (%)</label>
                  <input type="number" step="any" value={gstPercent} onChange={e => setGstPercent(e.target.value)} style={{ padding: '8px', border: '1px solid #fdba74', borderRadius: '4px', fontSize:'13px' }} />
              </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '25px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Subtotal (₹)</label>
                  <input type="number" name="subTotal" value={formData.subTotal.toFixed(2)} readOnly style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f1f5f9', fontSize:'13px', fontWeight: 'bold' }} />
              </div>
              
              {gstType === 'CGST_SGST' ? (
                  <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>CGST {(parseFloat(gstPercent)||0)/2}% (₹)</label>
                          <input type="number" name="cgst" value={formData.cgst.toFixed(2)} readOnly style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f1f5f9', fontSize:'13px' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>SGST {(parseFloat(gstPercent)||0)/2}% (₹)</label>
                          <input type="number" name="sgst" value={formData.sgst.toFixed(2)} readOnly style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f1f5f9', fontSize:'13px' }} />
                      </div>
                  </>
              ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>IGST {parseFloat(gstPercent)||0}% (₹)</label>
                      <input type="number" name="igst" value={formData.igst.toFixed(2)} readOnly style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f1f5f9', fontSize:'13px' }} />
                  </div>
              )}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Other Charges (₹)</label>
                  <input type="number" name="otherCharges" value={formData.otherCharges} onChange={handleChange} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize:'13px' }} />
              </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div>
                  <span style={{ fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>Final Grand Total</span><br/>
                  <strong style={{ fontSize: '24px', color: '#15803d' }}>₹{formData.grandTotal.toFixed(2)}</strong>
              </div>
              <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                  Create Invoice & Post to Ledger
              </button>
          </div>
      </form>

      <DataTable data={invoices} columns={columns} title="Invoice History" />
    </div>
  );
}