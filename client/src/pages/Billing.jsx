import React, { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';

const today = () => new Date().toISOString().split('T')[0];
const num = (value) => Number(value || 0);
const money = (value) => `Rs.${num(value).toFixed(2)}`;
const formatDate = (value) => value ? new Date(value).toLocaleDateString() : '-';
const inputDate = (value) => value ? new Date(value).toISOString().split('T')[0] : '';
const titleCase = (value) => String(value || '').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
const netWeight = (trip) => Math.max(num(trip.billWeight), num(trip.guaranteeWeight));
const freightAmount = (trip) => Math.max(num(trip.totalClientBill) - num(trip.clientExtraSizeCharge) - num(trip.haltingCharge), 0);
const freightRateLabel = (trip) => trip.clientCalcType === 'Fixed'
  ? `${money(trip.clientRate)} Fixed`
  : `${money(trip.clientRate)} / Ton`;
const measurement = (trip) => {
  const values = [trip.length, trip.width, trip.height].map(v => num(v));
  return values.some(Boolean) ? values.map(v => v || '-').join(' x ') : '-';
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function amountInWords(value) {
  const amount = Math.round(num(value));
  if (!amount) return 'Rupees Zero Only';
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const belowHundred = n => n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
  const belowThousand = n => {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    return `${hundred ? `${ones[hundred]} hundred${rest ? ' ' : ''}` : ''}${rest ? belowHundred(rest) : ''}`;
  };
  const parts = [];
  let rest = amount;
  const crore = Math.floor(rest / 10000000); rest %= 10000000;
  const lakh = Math.floor(rest / 100000); rest %= 100000;
  const thousand = Math.floor(rest / 1000); rest %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} thousand`);
  if (rest) parts.push(belowThousand(rest));
  return `Rupees ${titleCase(parts.join(' '))} Only`;
}

const initialInvoice = {
  invoiceNo: '',
  description: '',
  sacCode: '',
  showStatus: false,
  date: today(),
  dueDate: '',
  locationId: '',
  clientAccountId: '',
  incomeAccountId: '',
  subTotal: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  otherCharges: 0,
  grandTotal: 0,
  advanceReceived: 0,
  balanceAmount: 0
};

const fieldStyle = {
  padding: '8px',
  border: '1px solid #cbd5e1',
  borderRadius: '4px',
  fontSize: '13px'
};

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{label}</label>
      {children}
    </div>
  );
}

export default function Billing() {
  const [invoices, setInvoices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [trips, setTrips] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [formData, setFormData] = useState(initialInvoice);
  const [editId, setEditId] = useState(null);
  const [gstType, setGstType] = useState('CGST_SGST');
  const [gstPercent, setGstPercent] = useState(18);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterFromLoc, setFilterFromLoc] = useState('');
  const [filterToLoc, setFilterToLoc] = useState('');

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
      if (tripRes.ok) setTrips(await tripRes.json());
      if (accRes.ok) setAccounts(await accRes.json());
    } catch (err) {
      console.error('Error fetching billing data:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const selectedLocation = locations.find(l => String(l.id) === String(formData.locationId));
  const mappedClientAccount = selectedLocation
    ? accounts.find(a => String(a.clientId) === String(selectedLocation.companyId))
    : null;
  const defaultIncomeAccount = accounts.find(a => a.accountName === 'Freight Sales')
    || accounts.find(a => a.accountGroup?.includes('Direct Income') || a.accountType === 'Income');

  useEffect(() => {
    setFormData(prev => {
      const nextClientAccountId = mappedClientAccount ? String(mappedClientAccount.id) : prev.clientAccountId;
      const nextIncomeAccountId = defaultIncomeAccount ? String(defaultIncomeAccount.id) : prev.incomeAccountId;
      if (prev.clientAccountId === nextClientAccountId && prev.incomeAccountId === nextIncomeAccountId) return prev;
      return { ...prev, clientAccountId: nextClientAccountId, incomeAccountId: nextIncomeAccountId };
    });
  }, [mappedClientAccount?.id, defaultIncomeAccount?.id]);

  const displayTrips = useMemo(() => trips.filter(t => {
    if (editId) {
      if (t.invoiceId && t.invoiceId !== editId) return false;
    } else if (t.invoiceId) {
      return false;
    }
    if (selectedLocation && t.companyId !== selectedLocation.companyId) return false;
    if (!selectedLocation) return true;
    const tDate = new Date(t.date);
    if (filterStartDate && tDate < new Date(filterStartDate)) return false;
    if (filterEndDate && tDate > new Date(filterEndDate)) return false;
    if (filterFromLoc && !t.route?.fromLocation?.toLowerCase().includes(filterFromLoc.toLowerCase())) return false;
    if (filterToLoc && !t.route?.toLocation?.toLowerCase().includes(filterToLoc.toLowerCase())) return false;
    return true;
  }), [trips, editId, selectedLocation, filterStartDate, filterEndDate, filterFromLoc, filterToLoc]);

  const selectedTrips = useMemo(
    () => selectedTripIds.map(id => trips.find(t => t.id === parseInt(id))).filter(Boolean),
    [selectedTripIds, trips]
  );

  useEffect(() => {
    const subTotal = selectedTrips.reduce((sum, trip) => sum + num(trip.totalClientBill), 0);
    const rate = num(gstPercent);
    const cgst = gstType === 'CGST_SGST' ? subTotal * (rate / 2) / 100 : 0;
    const sgst = gstType === 'CGST_SGST' ? subTotal * (rate / 2) / 100 : 0;
    const igst = gstType === 'IGST' ? subTotal * rate / 100 : 0;
    const otherCharges = num(formData.otherCharges);
    const grandTotal = subTotal + cgst + sgst + igst + otherCharges;
    const advanceReceived = selectedTrips.reduce((sum, trip) => sum + num(trip.clientAdvanceAmount), 0);
    const balanceAmount = Math.max(grandTotal - advanceReceived, 0);
    setFormData(prev => ({ ...prev, subTotal, cgst, sgst, igst, grandTotal, advanceReceived, balanceAmount }));
  }, [selectedTrips, formData.otherCharges, gstType, gstPercent]);

  const resetForm = () => {
    setFormData(initialInvoice);
    setSelectedTripIds([]);
    setEditId(null);
    setGstType('CGST_SGST');
    setGstPercent(18);
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterFromLoc('');
    setFilterToLoc('');
  };

  const handleEdit = (invoice) => {
    setEditId(invoice.id);
    setFormData({
      ...initialInvoice,
      invoiceNo: invoice.invoiceNo || '',
      description: invoice.description || '',
      sacCode: invoice.sacCode || '',
      showStatus: Boolean(invoice.showStatus),
      date: inputDate(invoice.date),
      dueDate: inputDate(invoice.dueDate),
      locationId: invoice.locationId ? String(invoice.locationId) : '',
      subTotal: num(invoice.subTotal),
      cgst: num(invoice.cgst),
      sgst: num(invoice.sgst),
      igst: num(invoice.igst),
      otherCharges: num(invoice.otherCharges),
      grandTotal: num(invoice.grandTotal),
      advanceReceived: num(invoice.advanceReceived),
      balanceAmount: num(invoice.balanceAmount)
    });
    const taxTotal = num(invoice.cgst) + num(invoice.sgst) + num(invoice.igst);
    setGstType(num(invoice.igst) > 0 ? 'IGST' : 'CGST_SGST');
    setGstPercent(num(invoice.subTotal) > 0 ? Number(((taxTotal / num(invoice.subTotal)) * 100).toFixed(2)) : 18);
    setSelectedTripIds((invoice.trips || []).map(t => t.id));
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterFromLoc('');
    setFilterToLoc('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.clientAccountId || !formData.incomeAccountId) return alert('Please select both a Client and Income Account.');
    if (!selectedTripIds.length) return alert('Please select at least one trip to bill.');

    try {
      const response = await fetch(editId ? `/api/invoices/${editId}` : '/api/invoices', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, tripIds: selectedTripIds })
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.error || 'Invoice save failed.');
      alert(`Invoice ${editId ? 'updated' : 'generated'} and ledger updated successfully.`);
      resetForm();
      fetchData();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!(await window.confirmSnackbar('Are you sure? This will delete the invoice, release the trips, and reverse the ledger entries.'))) return;
    try {
      const response = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invoice delete failed.');
      }
      fetchData();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleExportPDF = async (invoice) => {
    const invoiceTrips = invoice.trips || [];
    if (!invoiceTrips.length) return alert('No invoice trips to print.');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to export this invoice.');

    let profile = {};
    try {
      const profileRes = await fetch('/api/my-company');
      if (profileRes.ok) profile = await profileRes.json();
    } catch (err) {
      console.error('Company profile fetch failed for invoice export:', err);
    }

    const supplierName = profile.companyName || 'Company';
    const supplierAddress = profile.address || '';
    const clientName = invoice.location?.company?.companyName || 'Client';
    const locationName = invoice.location?.locationName || '-';
    const clientAddress = invoice.location?.address || '';
    const taxPercent = num(invoice.subTotal) > 0
      ? (((num(invoice.cgst) + num(invoice.sgst) + num(invoice.igst)) / num(invoice.subTotal)) * 100).toFixed(2)
      : '0.00';
    const taxType = num(invoice.igst) > 0 ? 'IGST' : 'CGST + SGST';
    const cgstPercent = num(invoice.subTotal) > 0 ? ((num(invoice.cgst) / num(invoice.subTotal)) * 100).toFixed(2) : '0.00';
    const sgstPercent = num(invoice.subTotal) > 0 ? ((num(invoice.sgst) / num(invoice.subTotal)) * 100).toFixed(2) : '0.00';
    const igstPercent = num(invoice.subTotal) > 0 ? ((num(invoice.igst) / num(invoice.subTotal)) * 100).toFixed(2) : '0.00';
    const serviceDescription = invoice.description || `Freight charges for ${invoiceTrips.length} trip${invoiceTrips.length === 1 ? '' : 's'} as per annexure`;
    const sacCode = invoice.sacCode || '';
    const statusRow = invoice.showStatus ? `<div class="meta-row"><strong>Status</strong><span>${escapeHtml(invoice.status || '-')}</span></div>` : '';
    const tripRows = invoiceTrips.map((trip, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(serviceDescription)}</td>
        <td>${escapeHtml(sacCode || '-')}</td>
        <td>${escapeHtml(formatDate(trip.date))}</td>
        <td>${escapeHtml(trip.vehicle?.regNo || '-')}</td>
        <td>${escapeHtml(trip.route?.fromLocation || '-')}</td>
        <td>${escapeHtml(trip.route?.toLocation || '-')}</td>
        <td>${escapeHtml(measurement(trip))}</td>
        <td class="right">${num(trip.billWeight).toFixed(2)}</td>
        <td class="right">${num(trip.guaranteeWeight).toFixed(2)}</td>
        <td class="right strong">${netWeight(trip).toFixed(2)}</td>
        <td class="right">${money(freightAmount(trip))}</td>
        <td>${escapeHtml(freightRateLabel(trip))}</td>
        <td class="right">${money(trip.clientExtraSizeCharge)}</td>
        <td class="right">${money(trip.haltingCharge)}</td>
        <td class="right strong">${money(trip.totalClientBill)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(invoice.invoiceNo || 'Invoice')} - Invoice</title>
          <style>
            @page summary { size: A4 portrait; margin: 8mm; }
            @page annexure { size: A4 landscape; margin: 6mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #111827; font-family: Arial, sans-serif; background: #fff; }
            .summary-page { page: summary; min-height: 281mm; padding: 8mm; page-break-after: always; }
            .annexure-page { page: annexure; padding: 6mm; }
            h1, h2, h3, p { margin: 0; }
            .invoice-shell { border: 1.5px solid #111827; min-height: 265mm; display: flex; flex-direction: column; }
            .invoice-title { text-align: center; font-size: 18px; font-weight: 900; padding: 7px 10px; border-bottom: 1.5px solid #111827; text-transform: uppercase; }
            .supplier { text-align: center; padding: 10px 16px; border-bottom: 1px solid #111827; }
            .supplier h1 { font-size: 24px; font-weight: 900; letter-spacing: 0; text-transform: uppercase; }
            .supplier p { font-size: 11px; line-height: 1.45; margin-top: 3px; }
            .meta-grid { display: grid; grid-template-columns: 1.25fr 0.75fr; border-bottom: 1px solid #111827; }
            .party, .invoice-meta { padding: 10px 12px; min-height: 122px; }
            .invoice-meta { border-left: 1px solid #111827; }
            .label { font-size: 10px; color: #475569; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
            .name { font-size: 15px; font-weight: 900; text-transform: uppercase; }
            .line { font-size: 12px; line-height: 1.45; margin-top: 3px; }
            .meta-row { display: grid; grid-template-columns: 96px 1fr; gap: 8px; font-size: 12px; line-height: 1.6; }
            .meta-row strong { color: #334155; }
            .service-table, .tax-table, .totals { width: 100%; border-collapse: collapse; font-size: 12px; }
            .service-table th, .service-table td, .tax-table th, .tax-table td, .totals td { border: 1px solid #111827; padding: 7px; vertical-align: top; }
            .service-table th, .tax-table th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
            .section { padding: 12px; border-bottom: 1px solid #111827; }
            .summary-grid { display: grid; grid-template-columns: 1fr 330px; gap: 14px; padding: 12px; border-bottom: 1px solid #111827; }
            .totals td:first-child { font-weight: 700; }
            .totals .grand td { font-size: 15px; font-weight: 900; background: #f8fafc; }
            .amount-words { margin-top: 10px; border: 1px solid #cbd5e1; padding: 9px; font-size: 12px; min-height: 44px; }
            .bottom-grid { display: grid; grid-template-columns: 1fr 260px; gap: 0; margin-top: auto; border-top: 1px solid #111827; }
            .bank, .sign { padding: 12px; min-height: 108px; }
            .sign { border-left: 1px solid #111827; text-align: center; display: flex; flex-direction: column; justify-content: space-between; }
            .annexure-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 10px; }
            table.invoice-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
            .invoice-table th, .invoice-table td { border: 1px solid #94a3b8; padding: 4px; vertical-align: top; overflow-wrap: anywhere; }
            .invoice-table th { background: #e2e8f0; color: #0f172a; font-size: 8px; text-transform: uppercase; }
            .muted { color: #475569; font-size: 11px; }
            .center { text-align: center; }
            .right { text-align: right; }
            .strong { font-weight: 800; }
            .footer { position: fixed; bottom: 4mm; left: 7mm; right: 7mm; display: flex; justify-content: space-between; color: #64748b; font-size: 10px; }
          </style>
        </head>
        <body>
          <section class="summary-page">
            <div class="invoice-shell">
              <div class="invoice-title">Tax Invoice</div>
              <div class="supplier">
                <h1>${escapeHtml(supplierName)}</h1>
                <p>${escapeHtml(supplierAddress || '-')}</p>
                <p>
                  GSTIN: <strong>${escapeHtml(profile.gstNumber || '-')}</strong>
                  &nbsp; | &nbsp; PAN: <strong>${escapeHtml(profile.panNumber || '-')}</strong>
                </p>
              </div>

              <div class="meta-grid">
                <div class="party">
                  <div class="label">Bill To</div>
                  <div class="name">${escapeHtml(clientName)}</div>
                  <div class="line"><strong>Billing Location:</strong> ${escapeHtml(locationName)}</div>
                  <div class="line">${escapeHtml(clientAddress || '-')}</div>
                  <div class="line"><strong>GSTIN:</strong> ${escapeHtml(invoice.location?.gstNumber || '-')}</div>
                  <div class="line"><strong>PAN:</strong> ${escapeHtml(invoice.location?.company?.panNumber || '-')}</div>
                </div>
                <div class="invoice-meta">
                  <div class="meta-row"><strong>Invoice No</strong><span>${escapeHtml(invoice.invoiceNo || '-')}</span></div>
                  <div class="meta-row"><strong>Invoice Date</strong><span>${escapeHtml(formatDate(invoice.date))}</span></div>
                  <div class="meta-row"><strong>Due Date</strong><span>${escapeHtml(formatDate(invoice.dueDate))}</span></div>
                  <div class="meta-row"><strong>Tax Type</strong><span>${escapeHtml(taxType)}</span></div>
                  ${statusRow}
                </div>
              </div>

              <div class="section">
                <table class="service-table">
                  <thead>
                    <tr>
                      <th style="width:8%">S.No</th>
                      <th style="width:14%">SAC Code</th>
                      <th>Description</th>
                      <th style="width:14%">Trips</th>
                      <th style="width:18%">Taxable Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="center">1</td>
                      <td class="center">${escapeHtml(sacCode || '-')}</td>
                      <td>${escapeHtml(serviceDescription)}</td>
                      <td class="center">${invoiceTrips.length}</td>
                      <td class="right">${money(invoice.subTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="section">
                <table class="tax-table">
                  <thead>
                    <tr>
                      <th>Taxable Amount</th>
                      <th>GST %</th>
                      <th>CGST</th>
                      <th>SGST</th>
                      <th>IGST</th>
                      <th>Other Charges</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="right">${money(invoice.subTotal)}</td>
                      <td class="center">${taxPercent}%</td>
                      <td class="right">${money(invoice.cgst)}</td>
                      <td class="right">${money(invoice.sgst)}</td>
                      <td class="right">${money(invoice.igst)}</td>
                      <td class="right">${money(invoice.otherCharges)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="summary-grid">
                <div>
                  <div class="label">Remarks</div>
                  <div class="line">Detailed trip-wise freight calculation is attached as annexure.</div>
                  <div class="amount-words">
                    <div class="label">Amount Chargeable</div>
                    <strong>${money(invoice.grandTotal)}</strong>
                    <div style="margin-top:6px">${escapeHtml(amountInWords(invoice.grandTotal))}</div>
                  </div>
                </div>
                <table class="totals">
                  <tbody>
                    <tr><td>Subtotal</td><td class="right">${money(invoice.subTotal)}</td></tr>
                    <tr><td>CGST (${cgstPercent}%)</td><td class="right">${money(invoice.cgst)}</td></tr>
                    <tr><td>SGST (${sgstPercent}%)</td><td class="right">${money(invoice.sgst)}</td></tr>
                    <tr><td>IGST (${igstPercent}%)</td><td class="right">${money(invoice.igst)}</td></tr>
                    <tr><td>Other Charges</td><td class="right">${money(invoice.otherCharges)}</td></tr>
                    <tr class="grand"><td>Grand Total</td><td class="right">${money(invoice.grandTotal)}</td></tr>
                    <tr><td>Advance Received</td><td class="right">${money(invoice.advanceReceived)}</td></tr>
                    <tr><td>Total Paid</td><td class="right">${money(invoice.totalPaid)}</td></tr>
                    <tr class="grand"><td>Balance</td><td class="right">${money(invoice.balanceAmount)}</td></tr>
                  </tbody>
                </table>
              </div>

              <div class="bottom-grid">
                <div class="bank">
                  <div class="label">Bank & Payment Details</div>
                  <div class="line"><strong>Bank:</strong> ${escapeHtml(profile.bankName || '-')}</div>
                  <div class="line"><strong>Account No:</strong> ${escapeHtml(profile.accountNumber || '-')}</div>
                  <div class="line"><strong>IFSC:</strong> ${escapeHtml(profile.ifscCode || '-')}</div>
                  <div class="line" style="margin-top:10px">This is a computer generated invoice.</div>
                </div>
                <div class="sign">
                  <div>
                    <div class="label">For ${escapeHtml(supplierName)}</div>
                  </div>
                  <div>
                    <div style="border-top:1px solid #111827; padding-top:6px; font-weight:800">${escapeHtml(profile.signatoryRole || 'Authorized Signatory')}</div>
                  </div>
                </div>
              </div>
            </div>
            <p class="muted" style="padding: 4px 12px 0; text-align:right">Page 1</p>
          </section>

          <section class="annexure-page">
            <div class="annexure-head">
              <div>
                <h2>Annexure</h2>
                <p class="muted">${escapeHtml(supplierName)} | ${escapeHtml(invoice.invoiceNo || '-')} | ${escapeHtml(clientName)} - ${escapeHtml(locationName)}</p>
              </div>
              <p class="muted">Page 2</p>
            </div>
            <table class="invoice-table">
              <thead>
                <tr>
                  <th style="width:3%">S.No</th>
                  <th style="width:8%">Description</th>
                  <th style="width:5%">SAC Code</th>
                  <th style="width:7%">Loading Date</th>
                  <th style="width:8%">Truck Number</th>
                  <th style="width:8%">From</th>
                  <th style="width:8%">To</th>
                  <th style="width:8%">Measurement LxWxH</th>
                  <th style="width:7%">Billing Weight</th>
                  <th style="width:7%">Guarantee Weight</th>
                  <th style="width:6%">Net Weight</th>
                  <th style="width:8%">Freight Amount</th>
                  <th style="width:8%">Freight Rate</th>
                  <th style="width:7%">ODC Amount</th>
                  <th style="width:7%">Halting Amount</th>
                  <th style="width:8%">Balance</th>
                </tr>
              </thead>
              <tbody>${tripRows}</tbody>
            </table>
            <div class="footer">
              <span>${escapeHtml(invoice.invoiceNo || '-')}</span>
              <span>Page 2</span>
            </div>
          </section>
          <script>window.onload=()=>{window.print();window.close()}</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const allDisplayedSelected = displayTrips.length > 0 && displayTrips.every(t => selectedTripIds.includes(t.id));
  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const ids = displayTrips.map(t => t.id);
      setSelectedTripIds(Array.from(new Set([...selectedTripIds, ...ids])));
      return;
    }
    const displayIds = displayTrips.map(t => t.id);
    setSelectedTripIds(selectedTripIds.filter(id => !displayIds.includes(id)));
  };
  const handleTripToggle = (tripId) => {
    setSelectedTripIds(prev => prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]);
  };

  const columns = [
    { header: 'Invoice No', key: 'invoiceNo', render: (inv) => <strong>{inv.invoiceNo}</strong> },
    { header: 'Date', key: 'date', render: (inv) => formatDate(inv.date) },
    { header: 'Location', key: 'location.locationName', render: (inv) => inv.location?.locationName || 'N/A' },
    { header: 'Description', key: 'description', render: (inv) => inv.description || '-' },
    { header: 'SAC Code', key: 'sacCode', render: (inv) => inv.sacCode || '-' },
    { header: 'Trips', key: 'trips', render: (inv) => inv.trips?.length || 0 },
    { header: 'Total Amount', key: 'grandTotal', render: (inv) => <strong style={{ color: '#16a34a' }}>{money(inv.grandTotal)}</strong> },
    { header: 'Balance', key: 'balanceAmount', render: (inv) => <strong style={{ color: num(inv.balanceAmount) > 0 ? '#b45309' : '#16a34a' }}>{money(inv.balanceAmount)}</strong> },
    { header: 'Status', key: 'status', render: (inv) => <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: inv.status === 'Paid' ? '#dcfce7' : '#fee2e2', color: inv.status === 'Paid' ? '#16a34a' : '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>{inv.status}</span> },
    { header: 'Actions', key: 'actions', render: (inv) => (
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button type="button" onClick={() => handleEdit(inv)} style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Edit</button>
        <button type="button" onClick={() => handleExportPDF(inv)} style={{ color: '#059669', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Export PDF</button>
        <button type="button" onClick={() => handleDelete(inv.id)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
      </div>
    )}
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1500px', margin: '0 auto' }}>
      <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>{editId ? 'Edit Invoice' : 'Billing & Invoicing'}</h2>

      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
        <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>1. Invoice & Ledger Mapping</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
          <Field label="Billing Location">
            <select name="locationId" value={formData.locationId} onChange={(e) => { setFormData({ ...formData, locationId: e.target.value }); setSelectedTripIds([]); }} required style={fieldStyle}>
              <option value="">-- Select Location --</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.locationName} ({l.company?.companyName})</option>)}
            </select>
          </Field>
          <Field label="Invoice No">
            <input
              type="text"
              name="invoiceNo"
              value={formData.invoiceNo}
              onChange={e => setFormData({ ...formData, invoiceNo: e.target.value })}
              placeholder="First invoice manual, then auto"
              style={fieldStyle}
            />
          </Field>
          <Field label="Client Ledger - Dr">
            <select name="clientAccountId" value={formData.clientAccountId} onChange={e => setFormData({ ...formData, clientAccountId: e.target.value })} required style={{ ...fieldStyle, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }}>
              <option value="">-- Select Client Debtor --</option>
              {accounts.filter(a => a.accountGroup?.includes('Sundry Debtors')).map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </Field>
          <Field label="Revenue Account - Cr">
            <select name="incomeAccountId" value={formData.incomeAccountId} onChange={e => setFormData({ ...formData, incomeAccountId: e.target.value })} required style={{ ...fieldStyle, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }}>
              <option value="">-- Select Freight Income --</option>
              {accounts.filter(a => a.accountGroup?.includes('Direct Income') || a.accountType === 'Income').map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </Field>
          <Field label="Invoice Date">
            <input type="date" name="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required style={fieldStyle} />
          </Field>
          <Field label="Due Date">
            <input type="date" name="dueDate" value={formData.dueDate} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} style={fieldStyle} />
          </Field>
          <Field label="SAC Code">
            <input type="text" name="sacCode" value={formData.sacCode} onChange={e => setFormData({ ...formData, sacCode: e.target.value })} placeholder="996511" style={fieldStyle} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', paddingBottom: '8px' }}>
            <input id="showStatus" type="checkbox" checked={formData.showStatus} onChange={e => setFormData({ ...formData, showStatus: e.target.checked })} />
            <label htmlFor="showStatus" style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Show status on invoice</label>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Invoice Description">
              <input type="text" name="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Freight charges as per annexure" style={fieldStyle} />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px', gap: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '14px', color: '#334155', margin: 0 }}>2. Select Trips {selectedLocation ? `for ${selectedLocation.company?.companyName}` : ''}</h3>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#3b82f6', backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '4px' }}>Selected: {selectedTripIds.length}</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
          <Field label="Start Date"><input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} style={fieldStyle} /></Field>
          <Field label="End Date"><input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} style={fieldStyle} /></Field>
          <Field label="From Location"><input type="text" value={filterFromLoc} onChange={e => setFilterFromLoc(e.target.value)} style={fieldStyle} /></Field>
          <Field label="To Location"><input type="text" value={filterToLoc} onChange={e => setFilterToLoc(e.target.value)} style={fieldStyle} /></Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" onClick={() => { setFilterStartDate(''); setFilterEndDate(''); setFilterFromLoc(''); setFilterToLoc(''); }} style={{ padding: '8px 12px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Clear</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '25px', backgroundColor: '#f8fafc' }}>
          {displayTrips.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px 0' }}>{formData.locationId ? 'No trips found matching filters.' : 'Please select a Billing Location to view trips.'}</p>
          ) : (
            <table style={{ width: '100%', minWidth: '1450px', borderCollapse: 'collapse', fontSize: '12px', backgroundColor: 'white' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}><input type="checkbox" checked={allDisplayedSelected} onChange={handleSelectAll} title="Select all filtered trips" /></th>
                  <th style={{ padding: '10px' }}>S.No</th>
                  <th style={{ padding: '10px' }}>Loading Date</th>
                  <th style={{ padding: '10px' }}>Truck Number</th>
                  <th style={{ padding: '10px' }}>From</th>
                  <th style={{ padding: '10px' }}>To</th>
                  <th style={{ padding: '10px' }}>Measurement LxWxH</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Billing Weight</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Guarantee Weight</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Net Weight</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Freight Amount</th>
                  <th style={{ padding: '10px' }}>Freight Rate</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>ODC Amount</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Halting Amount</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {displayTrips.map((trip, index) => (
                  <tr key={trip.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: selectedTripIds.includes(trip.id) ? '#f0f9ff' : 'white' }}>
                    <td style={{ padding: '10px' }}><input type="checkbox" checked={selectedTripIds.includes(trip.id)} onChange={() => handleTripToggle(trip.id)} /></td>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{index + 1}</td>
                    <td style={{ padding: '10px' }}>{formatDate(trip.date)}</td>
                    <td style={{ padding: '10px' }}>{trip.vehicle?.regNo || '-'}</td>
                    <td style={{ padding: '10px' }}>{trip.route?.fromLocation || '-'}</td>
                    <td style={{ padding: '10px' }}>{trip.route?.toLocation || '-'}</td>
                    <td style={{ padding: '10px' }}>{measurement(trip)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{num(trip.billWeight).toFixed(2)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{num(trip.guaranteeWeight).toFixed(2)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{netWeight(trip).toFixed(2)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{money(freightAmount(trip))}</td>
                    <td style={{ padding: '10px' }}>{freightRateLabel(trip)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{money(trip.clientExtraSizeCharge)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{money(trip.haltingCharge)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#16a34a', fontWeight: 'bold' }}>{money(trip.totalClientBill)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>3. Taxes & Adjustments</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '25px' }}>
          <Field label="Tax Type">
            <select value={gstType} onChange={e => setGstType(e.target.value)} style={fieldStyle}>
              <option value="CGST_SGST">CGST & SGST</option>
              <option value="IGST">IGST</option>
            </select>
          </Field>
          <Field label="GST %">
            <input type="number" step="any" value={gstPercent} onChange={e => setGstPercent(e.target.value)} style={fieldStyle} />
          </Field>
          <Field label="Subtotal">
            <input type="number" value={num(formData.subTotal).toFixed(2)} readOnly style={{ ...fieldStyle, backgroundColor: '#f1f5f9', fontWeight: 'bold' }} />
          </Field>
          <Field label="Other Charges">
            <input type="number" name="otherCharges" value={formData.otherCharges} onChange={e => setFormData({ ...formData, otherCharges: e.target.value })} style={fieldStyle} />
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
            <div><span style={{ fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>Grand Total</span><br /><strong style={{ fontSize: '24px', color: '#15803d' }}>{money(formData.grandTotal)}</strong></div>
            <div><span style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: 'bold' }}>Advance Received</span><br /><strong style={{ fontSize: '24px', color: '#2563eb' }}>{money(formData.advanceReceived)}</strong></div>
            <div><span style={{ fontSize: '12px', color: '#92400e', fontWeight: 'bold' }}>Balance Receivable</span><br /><strong style={{ fontSize: '24px', color: '#b45309' }}>{money(formData.balanceAmount)}</strong></div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>{editId ? 'Update Invoice & Ledger' : 'Create Invoice & Post to Ledger'}</button>
            {editId && <button type="button" onClick={resetForm} style={{ padding: '12px 18px', backgroundColor: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Cancel Edit</button>}
          </div>
        </div>
      </form>

      <DataTable data={invoices} columns={columns} title="Invoice History" recycleBinType="invoices" onRecycleChanged={fetchData} />
    </div>
  );
}
