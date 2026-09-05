import React, { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import { downloadStandardInvoicePdf } from '../utils/standardInvoicePdf';

const today = () => new Date().toISOString().split('T')[0];
const num = (value) => Number(value || 0);
const roundMoney = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;
const invoiceRoundOff = (invoice) => roundMoney(num(invoice.grandTotal) - roundMoney(num(invoice.subTotal) + num(invoice.cgst) + num(invoice.sgst) + num(invoice.igst) + num(invoice.otherCharges)));
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
const multilineAddressHtml = (value, autoWrap = false) => {
  const raw = String(value || '-').replace(/\r\n?/g, '\n').trim();
  if (!autoWrap || raw.includes('\n')) return escapeHtml(raw).replace(/\n/g, '<br>');
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return escapeHtml(raw);
  const lines = [];
  let current = '';
  parts.forEach(part => {
    const candidate = current ? `${current}, ${part}` : part;
    if (current && candidate.length > 38) {
      lines.push(current);
      current = part;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines.map(escapeHtml).join('<br>');
};
const GST_STATE_NAMES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory'
};
const gstLocation = (gstNumber) => {
  const stateCode = String(gstNumber || '').trim().slice(0, 2);
  return { stateCode: GST_STATE_NAMES[stateCode] ? stateCode : '-', stateName: GST_STATE_NAMES[stateCode] || '-' };
};
const isBpclFormat = format => ['BPCL INVOICE', 'LPG Bill'].includes(format);
const isManualInvoiceFormat = format => format === 'IOCL INVOICE' || isBpclFormat(format);

function amountInWords(value) {
  const numericValue = Math.max(num(value), 0);
  const amount = Math.floor(numericValue);
  const paise = Math.round((numericValue - amount) * 100);
  if (!amount && !paise) return 'Rupees Zero Only';
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
  const rupeeWords = amount ? titleCase(parts.join(' ')) : 'Zero';
  const paiseWords = paise ? ` and ${titleCase(belowHundred(paise))} Paise` : '';
  return `Rupees ${rupeeWords}${paiseWords} Only`;
}

const initialInvoice = {
  invoiceNo: '',
  description: '',
  sacCode: '',
  vendorCode: '',
  poMigo: '',
  stateOfficeCode: '',
  taxableAmount: '',
  periodFrom: '',
  periodTo: '',
  transportationMode: 'By Road',
  vehicleNo: '',
  vehicleNos: [],
  productService: 'Transport Charges',
  declaration: 'I/we have taken registration under the CGST Act, 2017 and have exercised the option to pay tax on services of GTA in relation to transport of goods supplied by us under forward charge.',
  showStatus: false,
  showRoundOff: true,
  date: today(),
  dueDate: '',
  locationId: '',
  clientAccountId: '',
  incomeAccountId: '',
  subTotal: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  roundOff: 0,
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
  const [companies, setCompanies] = useState([]);
  const [trips, setTrips] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [companyProfile, setCompanyProfile] = useState({});
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [formData, setFormData] = useState(initialInvoice);
  const [editId, setEditId] = useState(null);
  const [gstType, setGstType] = useState('CGST_SGST');
  const [gstPercent, setGstPercent] = useState(18);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterFromLoc, setFilterFromLoc] = useState('');
  const [filterToLoc, setFilterToLoc] = useState('');
  const [quickClientName, setQuickClientName] = useState('');
  const [quickLocation, setQuickLocation] = useState({ locationName: '', address: '', gstNumber: '', stateOfficeCode: '', invoiceFormat: 'Standard' });
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState('');

  const fetchData = async () => {
    try {
      const [invRes, locRes, tripRes, accRes, vehicleRes, companyRes, profileRes] = await Promise.all([
        fetch('/api/invoices'),
        fetch('/api/locations'),
        fetch('/api/trips'),
        fetch('/api/ledger/accounts'),
        fetch('/api/vehicles'),
        fetch('/api/companies'),
        fetch('/api/my-company')
      ]);
      if (invRes.ok) setInvoices(await invRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (tripRes.ok) setTrips(await tripRes.json());
      if (accRes.ok) setAccounts(await accRes.json());
      if (vehicleRes.ok) setVehicles(await vehicleRes.json());
      if (companyRes.ok) setCompanies(await companyRes.json());
      if (profileRes.ok) setCompanyProfile(await profileRes.json());
    } catch (err) {
      console.error('Error fetching billing data:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const createQuickClient = async () => {
    const companyName = quickClientName.trim();
    if (!companyName) return setSetupError('Enter the client company name.');
    setSetupSaving(true);
    setSetupError('');
    try {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, status: 'Active' })
      });
      const client = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(client.error || 'Failed to create client.');
      setCompanies(previous => [client, ...previous.filter(item => item.id !== client.id)]);
      setSelectedClientId(String(client.id));
      setQuickClientName('');
      setFormData(initialInvoice);
    } catch (error) {
      setSetupError(error.message);
    } finally {
      setSetupSaving(false);
    }
  };

  const createQuickLocation = async () => {
    if (!selectedClientId) return setSetupError('Select a client first.');
    if (!quickLocation.locationName.trim()) return setSetupError('Enter the branch or billing location name.');
    setSetupSaving(true);
    setSetupError('');
    try {
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...quickLocation, companyId: selectedClientId })
      });
      const created = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(created.error || 'Failed to create billing location.');
      const client = companies.find(item => String(item.id) === String(selectedClientId));
      const location = { ...created, company: client || created.company };
      setLocations(previous => [location, ...previous.filter(item => item.id !== location.id)]);
      setFormData(previous => ({ ...initialInvoice, locationId: String(location.id), vendorCode: client?.vendorCode || '', stateOfficeCode: location.stateOfficeCode || '', clientAccountId: previous.clientAccountId, incomeAccountId: previous.incomeAccountId }));
      setQuickLocation({ locationName: '', address: '', gstNumber: '', stateOfficeCode: '', invoiceFormat: 'Standard' });
      await fetchData();
    } catch (error) {
      setSetupError(error.message);
    } finally {
      setSetupSaving(false);
    }
  };

  const selectedLocation = locations.find(l => String(l.id) === String(formData.locationId));
  const selectedGstLocation = gstLocation(selectedLocation?.gstNumber);
  const isIocl = selectedLocation?.invoiceFormat === 'IOCL INVOICE';
  const isBpcl = isBpclFormat(selectedLocation?.invoiceFormat);
  const isManualTaxInvoice = isIocl || isBpcl;
  const companyGstLocation = gstLocation(companyProfile.gstNumber);
  const clientLocations = locations.filter(location => String(location.companyId) === String(selectedClientId));
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

  useEffect(() => {
    if (num(gstPercent) <= 0) {
      if (gstType !== 'NONE') setGstType('NONE');
      return;
    }
    const companyCode = companyGstLocation.stateCode;
    const billingCode = selectedGstLocation.stateCode;
    if (companyCode === '-' || billingCode === '-') return;
    const mappedType = companyCode === billingCode ? 'CGST_SGST' : 'IGST';
    if (gstType !== mappedType) setGstType(mappedType);
  }, [gstPercent, companyGstLocation.stateCode, selectedGstLocation.stateCode, gstType]);

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
    const subTotal = isManualTaxInvoice
      ? roundMoney(Math.max(num(formData.taxableAmount), 0))
      : roundMoney(selectedTrips.reduce((sum, trip) => sum + num(trip.totalClientBill), 0));
    const rate = num(gstPercent);
    const totalTax = roundMoney(subTotal * rate / 100);
    const cgst = gstType === 'CGST_SGST' ? roundMoney(subTotal * (rate / 2) / 100) : 0;
    const sgst = gstType === 'CGST_SGST' ? cgst : 0;
    const igst = gstType === 'IGST' ? totalTax : 0;
    const otherCharges = isManualTaxInvoice ? 0 : roundMoney(num(formData.otherCharges));
    const grandTotal = roundMoney(subTotal + totalTax + otherCharges);
    const roundOff = roundMoney(grandTotal - roundMoney(subTotal + cgst + sgst + igst + otherCharges));
    const advanceReceived = isManualTaxInvoice ? 0 : roundMoney(selectedTrips.reduce((sum, trip) => sum + num(trip.clientAdvanceAmount), 0));
    const balanceAmount = roundMoney(Math.max(grandTotal - advanceReceived, 0));
    setFormData(prev => ({ ...prev, subTotal, cgst, sgst, igst, roundOff, grandTotal, advanceReceived, balanceAmount }));
  }, [selectedTrips, formData.otherCharges, formData.taxableAmount, gstType, gstPercent, isManualTaxInvoice]);

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
    setSelectedClientId(invoice.location?.companyId ? String(invoice.location.companyId) : '');
    setFormData({
      ...initialInvoice,
      invoiceNo: invoice.invoiceNo || '',
      description: invoice.description || '',
      sacCode: invoice.sacCode || '',
      vendorCode: invoice.vendorCode || '',
      poMigo: invoice.poMigo || '',
      stateOfficeCode: invoice.stateOfficeCode || invoice.location?.stateOfficeCode || '',
      taxableAmount: num(invoice.subTotal),
      periodFrom: inputDate(invoice.periodFrom),
      periodTo: inputDate(invoice.periodTo),
      transportationMode: invoice.transportationMode || 'By Road',
      vehicleNo: invoice.vehicleNo || '',
      vehicleNos: String(invoice.vehicleNo || '').split(',').map(value => value.trim()).filter(Boolean),
      productService: invoice.productService || 'Transport Charges',
      declaration: invoice.declaration || initialInvoice.declaration,
      showStatus: Boolean(invoice.showStatus),
      showRoundOff: invoice.showRoundOff !== false,
      date: inputDate(invoice.date),
      dueDate: inputDate(invoice.dueDate),
      locationId: invoice.locationId ? String(invoice.locationId) : '',
      subTotal: num(invoice.subTotal),
      cgst: num(invoice.cgst),
      sgst: num(invoice.sgst),
      igst: num(invoice.igst),
      roundOff: invoiceRoundOff(invoice),
      otherCharges: num(invoice.otherCharges),
      grandTotal: num(invoice.grandTotal),
      advanceReceived: num(invoice.advanceReceived),
      balanceAmount: num(invoice.balanceAmount)
    });
    const taxTotal = num(invoice.cgst) + num(invoice.sgst) + num(invoice.igst);
    setGstType(num(invoice.igst) > 0 ? 'IGST' : 'CGST_SGST');
    setGstPercent(invoice.gstPercent ?? (num(invoice.subTotal) > 0 ? Number(((taxTotal / num(invoice.subTotal)) * 100).toFixed(2)) : 18));
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
    if (!isManualTaxInvoice && !selectedTripIds.length) return alert('Please select at least one trip to bill.');
    if (isManualTaxInvoice && !formData.invoiceNo.trim()) return alert('Invoice number is required.');
    if (isManualTaxInvoice && num(formData.taxableAmount) <= 0) return alert('Enter a taxable amount greater than zero.');
    if (isManualTaxInvoice && !formData.vehicleNos.length) return alert('Select at least one vehicle for the invoice.');

    try {
      const response = await fetch(editId ? `/api/invoices/${editId}` : '/api/invoices', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, invoiceFormat: selectedLocation?.invoiceFormat || 'Standard', gstType, gstPercent, tripIds: isManualTaxInvoice ? [] : selectedTripIds })
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
    const isStandaloneTaxInvoice = isManualInvoiceFormat(invoice.invoiceFormat);
    if (!isStandaloneTaxInvoice && !invoiceTrips.length) return alert('No invoice trips to print.');

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
    const taxType = num(invoice.igst) > 0 ? 'IGST' : 'CGST + SGST';
    const cgstPercent = num(invoice.subTotal) > 0 ? ((num(invoice.cgst) / num(invoice.subTotal)) * 100).toFixed(2) : '0.00';
    const sgstPercent = num(invoice.subTotal) > 0 ? ((num(invoice.sgst) / num(invoice.subTotal)) * 100).toFixed(2) : '0.00';
    const igstPercent = num(invoice.subTotal) > 0 ? ((num(invoice.igst) / num(invoice.subTotal)) * 100).toFixed(2) : '0.00';
    const serviceDescription = invoice.description || `Freight charges for ${invoiceTrips.length} trip${invoiceTrips.length === 1 ? '' : 's'} as per annexure`;
    const sacCode = invoice.sacCode || '';
    const vendorCode = invoice.vendorCode || invoice.location?.company?.vendorCode || '';
    const poMigo = invoice.poMigo || '';
    const statusRow = invoice.showStatus ? `<div class="meta-row"><strong>Status</strong><span>${escapeHtml(invoice.status || '-')}</span></div>` : '';
    if (isStandaloneTaxInvoice) {
      const isBpclInvoice = isBpclFormat(invoice.invoiceFormat);
      if (isBpclInvoice) {
        const vehicleNumbers = String(invoice.vehicleNo || '').split(',').map(value => value.trim()).filter(Boolean);
        const vehicleNumberHtml = vehicleNumbers.length ? `<div class="vehicles"><strong>Vehicle No:</strong><br>${vehicleNumbers.map(escapeHtml).join('<br>')}</div>` : '';
        const taxRows = num(invoice.gstPercent) === 0
          ? `<tr><td colspan="2" class="tax-label">GST 0%</td><td class="amount">0.00</td></tr>`
          : invoice.gstType === 'CGST_SGST'
            ? `<tr><td colspan="2" class="tax-label">CGST ${num(invoice.gstPercent) / 2}%</td><td class="amount">${num(invoice.cgst).toFixed(2)}</td></tr><tr><td colspan="2" class="tax-label">SGST ${num(invoice.gstPercent) / 2}%</td><td class="amount">${num(invoice.sgst).toFixed(2)}</td></tr>`
            : `<tr><td colspan="2" class="tax-label">IGST ${num(invoice.gstPercent)}%</td><td class="amount">${num(invoice.igst).toFixed(2)}</td></tr>`;
        const roundOffRow = invoice.showRoundOff !== false && invoiceRoundOff(invoice) !== 0
          ? `<tr><td colspan="2" class="tax-label">Round Off</td><td class="amount">${invoiceRoundOff(invoice).toFixed(2)}</td></tr>`
          : '';
        const rule48Declaration = profile.rule48Declaration || 'I/We hereby declare that though our aggregate turnover in any preceding financial year from 2017-18 onwards is more than the aggregate turnover notified under sub-rule (4) of Rule 48, we are not required to prepare an invoice in terms of the provisions of the said sub-rule.';
        const gtaDeclaration = profile.gtaDeclaration || invoice.declaration || 'I/We have taken registration under the CGST Act, 2017 and have exercised the option to pay tax on services of GTA in relation to transport of goods supplied by us under forward charge.';
        printWindow.document.write(`
          <html><head><title>${escapeHtml(invoice.invoiceNo)} - BPCL Invoice</title><style>
            @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:"Times New Roman",serif;font-size:12px}.invoice{border:1.5px solid #111;width:100%;min-height:270mm}.row{border-bottom:1px solid #111}.title{text-align:center;font-weight:700;font-size:15px;padding:3px}.supplier{text-align:center;padding:4px 10px 6px}.supplier h1{font-size:22px;margin:0 0 2px;text-transform:uppercase}.supplier div{line-height:1.3}.reference{display:grid;grid-template-columns:1.1fr .9fr}.reference>div{padding:5px 8px;line-height:1.5}.reference>div+div{border-left:1px solid #111}.kv{display:grid;grid-template-columns:110px 1fr;gap:4px}.bill-to{padding:5px 8px;line-height:1.35;min-height:83px}.bill-to strong{display:block;font-size:13px}.items{width:100%;border-collapse:collapse;table-layout:fixed}.items th,.items td{border-right:1px solid #111;border-bottom:1px solid #111;padding:5px;vertical-align:top}.items th:last-child,.items td:last-child{border-right:0}.items th{text-align:center;font-size:13px}.center{text-align:center}.description{height:90px;font-size:13px}.vehicles{font-size:11px;margin-top:8px;line-height:1.25}.amount{text-align:right;vertical-align:bottom!important}.tax-label{font-weight:700}.total{font-size:14px;font-weight:700}.words{padding:5px 8px;min-height:59px}.words-title{font-weight:700}.words-value{padding:13px 38px 4px}.bottom{display:grid;grid-template-columns:1.1fr .9fr;border-bottom:1px solid #111}.bank,.signature{padding:6px 8px;min-height:112px;line-height:1.5}.signature{border-left:1px solid #111;font-weight:700}.signature-space{height:45px}.declarations{display:grid;grid-template-columns:1fr 1fr}.declarations>div{padding:6px 8px;min-height:120px;line-height:1.3;text-align:justify}.declarations>div+div{border-left:1px solid #111}
          </style></head><body><div class="invoice">
            <div class="title row">TAX INVOICE</div>
            <div class="supplier row"><h1>${escapeHtml(supplierName)}</h1><div>${multilineAddressHtml(supplierAddress)}</div>${profile.phoneNumber ? `<div>Cell No: ${escapeHtml(profile.phoneNumber)}</div>` : ''}<div>${profile.email ? `E-mail: ${escapeHtml(profile.email)} &nbsp;&nbsp;` : ''}GST NO: ${escapeHtml(profile.gstNumber || '-')}</div></div>
            <div class="reference row"><div><div class="kv"><strong>GST</strong><span>: ${escapeHtml(invoice.location?.gstNumber || '-')}</span></div><div class="kv"><strong>PAN</strong><span>: ${escapeHtml(invoice.location?.company?.panNumber || '-')}</span></div><div class="kv"><strong>S.No</strong><span>: ${escapeHtml(invoice.invoiceNo || '-')}</span></div></div><div><div class="kv"><strong>Vendor Code</strong><span>: ${escapeHtml(invoice.vendorCode || invoice.location?.company?.vendorCode || '-')}</span></div><div class="kv"><strong>Bill Date</strong><span>: ${escapeHtml(formatDate(invoice.date))}</span></div><div class="kv"><strong>Payment Date</strong><span>: ${escapeHtml(formatDate(invoice.dueDate))}</span></div></div></div>
            <div class="bill-to row"><strong>Bill To</strong><b>${escapeHtml(clientName)}</b>${locationName && locationName !== '-' ? ` / ${escapeHtml(locationName)}` : ''}<br>${multilineAddressHtml(clientAddress)}<br><b>GST NO: ${escapeHtml(invoice.location?.gstNumber || '-')}</b></div>
            <table class="items"><colgroup><col style="width:58%"><col style="width:14%"><col style="width:28%"></colgroup><thead><tr><th>Description of Goods</th><th>SAC Code</th><th>Amount</th></tr></thead><tbody><tr><td class="description">${escapeHtml(invoice.productService || 'Transport Charges')}${vehicleNumberHtml}</td><td class="center">${escapeHtml(invoice.sacCode || '-')}</td><td class="amount">${num(invoice.subTotal).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>${taxRows}${roundOffRow}<tr class="total"><td colspan="2">Grand Total</td><td class="amount">${num(invoice.grandTotal).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr></tbody></table>
            <div class="words row"><div class="words-title">Amount Chargeable (in words)</div><div class="words-value">${escapeHtml(amountInWords(invoice.grandTotal))}.</div></div>
            <div class="bottom"><div class="bank"><strong>Our Bank Details:-</strong><br><span class="kv"><b>Beneficiary Name</b><span>: ${escapeHtml(profile.beneficiaryName || supplierName)}</span></span><span class="kv"><b>Bank</b><span>: ${escapeHtml(profile.bankName || '-')}</span></span><span class="kv"><b>Account No</b><span>: ${escapeHtml(profile.accountNumber || '-')}</span></span><span class="kv"><b>Branch</b><span>: ${escapeHtml(profile.bankBranch || '-')}</span></span><span class="kv"><b>IFSC CODE</b><span>: ${escapeHtml(profile.ifscCode || '-')}</span></span></div><div class="signature">For ${escapeHtml(supplierName)}<div class="signature-space"></div>${escapeHtml(profile.signatoryRole || 'Authorized Signatory')}<br>${escapeHtml(profile.signatoryName || '')}</div></div>
            <div class="declarations"><div>“${escapeHtml(rule48Declaration)}”</div><div>“${escapeHtml(gtaDeclaration)}”</div></div>
          </div><script>window.onload=()=>{window.print();window.close()}</script></body></html>`);
        printWindow.document.close();
        return;
      }
      const gstLabel = num(invoice.gstPercent) === 0 ? 'GST' : invoice.gstType === 'CGST_SGST' ? 'CGST + SGST' : 'IGST';
      const supplierState = gstLocation(profile.gstNumber);
      const receiverState = gstLocation(invoice.location?.gstNumber);
      const formatTitle = isBpclFormat(invoice.invoiceFormat) ? 'BPCL Invoice' : 'IOCL Invoice';
      const isIoclInvoice = invoice.invoiceFormat === 'IOCL INVOICE';
      const supplierAddressHtml = multilineAddressHtml(supplierAddress, isIoclInvoice);
      const receiverAddressHtml = multilineAddressHtml(clientAddress, isIoclInvoice);
      const vehicleNumbers = String(invoice.vehicleNo || '').split(',').map(value => value.trim()).filter(Boolean);
      const vehicleNumberHtml = vehicleNumbers.length ? vehicleNumbers.map(value => escapeHtml(value)).join('<br>') : '-';
      printWindow.document.write(`
        <html><head><title>${escapeHtml(invoice.invoiceNo)} - ${formatTitle}</title><style>
          @page { size:A4 portrait; margin:10mm } *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:12px}
          .head{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:28px;align-items:start;padding:10px 16px 24px;border-bottom:3px double #222}.head h1{font-size:34px;line-height:1.1;letter-spacing:3px;margin:0;text-transform:uppercase}.addr{line-height:1.5;width:250px;font-size:13px;font-weight:600;overflow-wrap:anywhere}.multiline{white-space:pre-line;overflow-wrap:anywhere}.receiver-address{margin:3px 0 6px;padding-left:0;line-height:1.6}
          .box{border:1px solid #222;margin-top:34px}.title{text-align:center;font-size:23px;font-weight:800;padding:10px;border-bottom:1px solid #222}.grid{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #222}.cell{padding:11px;font-size:13px;line-height:1.85}.cell+ .cell{border-left:1px solid #222}.supplier-state{display:grid;grid-template-columns:120px 1fr;gap:12px}.receiver-state{display:grid;grid-template-columns:1fr 110px 1.25fr;gap:10px;margin-top:6px;padding-top:6px;border-top:1px solid #aaa}
          .receiver{padding:10px;font-size:13px;border-bottom:1px solid #222;line-height:1.7}.receiver h3{font-size:15px;margin:0 0 8px}.items{width:100%;border-collapse:collapse}.items th,.items td{border:1px solid #444;padding:9px}.items th{background:#e5e7eb}.right{text-align:right}.center{text-align:center}.strong{font-weight:800;font-size:15px}
          .words,.declaration{padding:10px;border-top:1px solid #222}.declaration{min-height:150px}.sign{text-align:right;margin-top:35px;font-weight:700}
        </style></head><body>
          <div class="head"><h1>${escapeHtml(supplierName)}</h1><div class="addr">${supplierAddressHtml}${isIoclInvoice ? '' : `<br>GSTIN: ${escapeHtml(profile.gstNumber || '-')}`}</div></div>
          <div class="box"><div class="title">TAX INVOICE</div>
            <div class="grid"><div class="cell"><strong>Invoice No:</strong> ${escapeHtml(invoice.invoiceNo)}<br><strong>Invoice Date:</strong> ${escapeHtml(formatDate(invoice.date))}<br><strong>GST:</strong> ${escapeHtml(profile.gstNumber || '-')}<br>${isIoclInvoice ? `<div class="supplier-state"><span><strong>State Code:</strong> ${escapeHtml(supplierState.stateCode)}</span><span><strong>State:</strong> ${escapeHtml(supplierState.stateName)}</span></div>` : `<strong>State Code:</strong> ${escapeHtml(supplierState.stateCode)}`}</div>
            <div class="cell"><strong>Transportation Mode:</strong> ${escapeHtml(invoice.transportationMode || 'By Road')}<br><strong>Vehicle No:</strong><div style="padding-left:12px">${vehicleNumberHtml}</div><strong>Vendor Code:</strong> ${escapeHtml(invoice.vendorCode || invoice.location?.company?.vendorCode || '-')}<br><strong>Period:</strong> ${escapeHtml(formatDate(invoice.periodFrom))} to ${escapeHtml(formatDate(invoice.periodTo))}</div></div>
            <div class="receiver"><h3>Details of Receiver / Billed to</h3><strong>Name:</strong> ${escapeHtml(clientName)}<br><strong>Address:</strong><div class="receiver-address">${receiverAddressHtml}</div><strong>GSTIN:</strong> ${escapeHtml(invoice.location?.gstNumber || '-')}<div class="receiver-state"><span><strong>State:</strong> ${escapeHtml(receiverState.stateName)}</span><span><strong>State Code:</strong> ${escapeHtml(receiverState.stateCode)}</span><span><strong>State Office Code:</strong> ${escapeHtml(invoice.stateOfficeCode || invoice.location?.stateOfficeCode || '-')}</span></div></div>
            <table class="items"><thead><tr><th style="width:12%">Slr No</th><th>Name of Product / Service</th><th style="width:18%">SAC</th><th style="width:24%">Total Amount (Rs.)</th></tr></thead><tbody>
              <tr><td class="center">1</td><td>${escapeHtml(invoice.productService || 'Transport Charges')}</td><td class="center">${escapeHtml(invoice.sacCode || '-')}</td><td class="right">${num(invoice.subTotal).toFixed(2)}</td></tr>
              <tr class="strong"><td colspan="3" class="right">Sub Total</td><td class="right">${num(invoice.subTotal).toFixed(2)}</td></tr>
              ${num(invoice.gstPercent) === 0
                ? `<tr><td colspan="3" class="right">GST 0%</td><td class="right">0.00</td></tr>`
                : invoice.gstType === 'CGST_SGST'
                ? `<tr><td colspan="3" class="right">CGST ${num(invoice.gstPercent) / 2}%</td><td class="right">${num(invoice.cgst).toFixed(2)}</td></tr><tr><td colspan="3" class="right">SGST ${num(invoice.gstPercent) / 2}%</td><td class="right">${num(invoice.sgst).toFixed(2)}</td></tr>`
                : `<tr><td colspan="3" class="right">${gstLabel} ${num(invoice.gstPercent)}%</td><td class="right">${num(invoice.igst).toFixed(2)}</td></tr>`}
              ${invoice.showRoundOff !== false && invoiceRoundOff(invoice) !== 0 ? `<tr><td colspan="3" class="right">Round Off</td><td class="right">${invoiceRoundOff(invoice).toFixed(2)}</td></tr>` : ''}
              <tr class="strong"><td colspan="3" class="right">Total</td><td class="right">${num(invoice.grandTotal).toFixed(2)}</td></tr>
            </tbody></table>
            <div class="words"><strong>Rupees:</strong> ${escapeHtml(amountInWords(invoice.grandTotal))}</div>
            <div class="declaration"><strong>Declaration</strong><p>${escapeHtml(invoice.declaration || '-')}</p><div class="sign">For ${escapeHtml(supplierName)}<br><br><br>${escapeHtml(profile.signatoryRole || 'Authorized Signatory')}</div></div>
          </div><script>window.onload=()=>{window.print();window.close()}</script>
        </body></html>`);
      printWindow.document.close();
      return;
    }
    const tripRows = invoiceTrips.map((trip, index) => `
      <tr>
        <td class="center">${index + 1}</td>
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
            .summary-page { page: summary; width: 194mm; height: 281mm; padding: 0; overflow: hidden; break-after: page; page-break-after: always; }
            .annexure-page { page: annexure; width: 285mm; min-height: 198mm; padding: 0; overflow: hidden; }
            h1, h2, h3, p { margin: 0; }
            .invoice-shell { border: 1.5px solid #111827; height: 276mm; display: flex; flex-direction: column; overflow: hidden; }
            .invoice-title { text-align: center; font-size: 18px; font-weight: 900; padding: 7px 10px; border-bottom: 1.5px solid #111827; text-transform: uppercase; }
            .supplier { text-align: center; padding: 10px 16px; border-bottom: 1px solid #111827; }
            .supplier h1 { font-size: 24px; font-weight: 900; letter-spacing: 0; text-transform: uppercase; }
            .supplier p { font-size: 11px; line-height: 1.45; margin-top: 3px; }
            .multiline { white-space: pre-line; overflow-wrap: anywhere; }
            .meta-grid { display: grid; grid-template-columns: 1.25fr 0.75fr; border-bottom: 1px solid #111827; }
            .party, .invoice-meta { padding: 8px 10px; min-height: 105px; }
            .invoice-meta { border-left: 1px solid #111827; }
            .label { font-size: 10px; color: #475569; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
            .name { font-size: 15px; font-weight: 900; text-transform: uppercase; }
            .line { font-size: 12px; line-height: 1.45; margin-top: 3px; }
            .meta-row { display: grid; grid-template-columns: 96px 1fr; gap: 8px; font-size: 12px; line-height: 1.6; }
            .meta-row strong { color: #334155; }
            .service-table, .totals { width: 100%; border-collapse: collapse; font-size: 12px; }
            .service-table th, .service-table td, .totals td { border: 1px solid #111827; padding: 7px; vertical-align: top; }
            .service-table th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
            .section { padding: 8px 10px; border-bottom: 1px solid #111827; }
            .summary-grid { display: grid; grid-template-columns: 1fr 82mm; gap: 10px; padding: 8px 10px; border-bottom: 1px solid #111827; }
            .totals td:first-child { font-weight: 700; }
            .totals .grand td { font-size: 15px; font-weight: 900; background: #f8fafc; }
            .amount-words { margin-top: 10px; border: 1px solid #cbd5e1; padding: 9px; font-size: 12px; min-height: 44px; }
            .bottom-grid { display: grid; grid-template-columns: 1fr 260px; gap: 0; margin-top: auto; border-top: 1px solid #111827; }
            .bank, .sign { padding: 9px 10px; min-height: 86px; }
            .sign { border-left: 1px solid #111827; text-align: center; display: flex; flex-direction: column; justify-content: space-between; }
            .annexure-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 10px; }
            table.invoice-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${invoiceTrips.length > 20 ? '6px' : invoiceTrips.length > 14 ? '7px' : '8px'}; }
            .invoice-table th, .invoice-table td { border: 1px solid #94a3b8; padding: ${invoiceTrips.length > 20 ? '2px' : '3px'}; vertical-align: top; overflow-wrap: anywhere; }
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
                <p class="multiline">${escapeHtml(supplierAddress || '-')}</p>
                <p>
                  GSTIN: <strong>${escapeHtml(profile.gstNumber || '-')}</strong>
                  &nbsp; | &nbsp; PAN: <strong>${escapeHtml(profile.panNumber || '-')}</strong>
                </p>
              </div>

              <div class="meta-grid">
                <div class="party">
                  <div class="label">Bill To</div>
                  <div class="name">${escapeHtml(clientName)}</div>
                  <div class="line multiline">${escapeHtml(clientAddress || '-')}</div>
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
                      <th>Description</th>
                      <th style="width:12%">SAC Code</th>
                      <th style="width:14%">Vendor Code</th>
                      <th style="width:14%">PO / MIGO</th>
                      <th style="width:9%">Trips</th>
                      <th style="width:16%">Taxable Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="center">1</td>
                      <td>${escapeHtml(serviceDescription)}</td>
                      <td class="center">${escapeHtml(sacCode || '-')}</td>
                      <td>${escapeHtml(vendorCode || '-')}</td>
                      <td>${escapeHtml(poMigo || '-')}</td>
                      <td class="center">${invoiceTrips.length}</td>
                      <td class="right">${money(invoice.subTotal)}</td>
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
                    ${invoice.showRoundOff !== false && invoiceRoundOff(invoice) !== 0 ? `<tr><td>Round Off</td><td class="right">${money(invoiceRoundOff(invoice))}</td></tr>` : ''}
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
              <tbody>
                ${tripRows}
                <tr class="strong">
                  <td colspan="13" class="right">Balance Amount</td>
                  <td class="right">${money(invoice.balanceAmount)}</td>
                </tr>
              </tbody>
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

  const handleDownloadPDF = async (invoice) => {
    if (isManualInvoiceFormat(invoice.invoiceFormat)) return alert('Use Print / Save PDF for this custom invoice format.');
    if (!(invoice.trips || []).length) return alert('No invoice trips to download.');
    try {
      let profile = {};
      const response = await fetch('/api/my-company');
      if (response.ok) profile = await response.json();
      downloadStandardInvoicePdf({ invoice, profile, amountInWords });
    } catch (error) {
      console.error('PDF download failed:', error);
      alert(error.message || 'Could not download the PDF.');
    }
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
    { header: 'State Office Code', key: 'stateOfficeCode', render: (inv) => inv.stateOfficeCode || inv.location?.stateOfficeCode || '-' },
    { header: 'Description', key: 'description', render: (inv) => inv.description || '-' },
    { header: 'SAC Code', key: 'sacCode', render: (inv) => inv.sacCode || '-' },
    { header: 'Vendor Code', key: 'vendorCode', render: (inv) => inv.vendorCode || inv.location?.company?.vendorCode || '-' },
    { header: 'PO / MIGO', key: 'poMigo', render: (inv) => inv.poMigo || '-' },
    { header: 'Trips', key: 'trips', sortValue: inv => inv.trips?.length || 0, render: (inv) => inv.trips?.length || 0 },
    { header: 'Total Amount', key: 'grandTotal', render: (inv) => <strong style={{ color: '#16a34a' }}>{money(inv.grandTotal)}</strong> },
    { header: 'Balance', key: 'balanceAmount', render: (inv) => <strong style={{ color: num(inv.balanceAmount) > 0 ? '#b45309' : '#16a34a' }}>{money(inv.balanceAmount)}</strong> },
    { header: 'Status', key: 'status', render: (inv) => <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: inv.status === 'Paid' ? '#dcfce7' : '#fee2e2', color: inv.status === 'Paid' ? '#16a34a' : '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>{inv.status}</span> },
    { header: 'Actions', key: 'actions', render: (inv) => (
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button type="button" onClick={() => handleEdit(inv)} style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Edit</button>
        <button type="button" onClick={() => handleExportPDF(inv)} style={{ color: '#059669', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Print / Save PDF</button>
        {!isManualInvoiceFormat(inv.invoiceFormat) && <button type="button" onClick={() => handleDownloadPDF(inv)} style={{ color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Download PDF</button>}
        <button type="button" onClick={() => handleDelete(inv.id)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
      </div>
    )}
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1500px', margin: '0 auto' }}>
      <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>{editId ? 'Edit Invoice' : 'Billing & Invoicing'}</h2>

      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', color: '#334155', marginTop: 0 }}>Select Client and Invoice Type</h3>
        {companies.length === 0 && <div style={{ padding: '14px', marginBottom: '15px', border: '1px solid #f59e0b', borderRadius: '8px', background: '#fffbeb' }}>
          <strong style={{ color: '#92400e' }}>This company does not have a Bill-To client yet.</strong>
          <p style={{ color: '#78350f', fontSize: '13px', margin: '5px 0 10px' }}>Create the customer/client here. It will be saved only under the currently selected tenant and its ledger will be mapped automatically.</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input value={quickClientName} onChange={event => setQuickClientName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); createQuickClient(); } }} placeholder="Client company name" style={{ ...fieldStyle, maxWidth: '360px' }} />
            <button type="button" disabled={setupSaving} onClick={createQuickClient} style={{ padding: '9px 14px', border: 0, borderRadius: '6px', background: '#2563eb', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Create Client</button>
          </div>
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px' }}>
          <Field label="Client">
            <select value={selectedClientId} onChange={event => {
              setSelectedClientId(event.target.value);
              setFormData({ ...initialInvoice, clientAccountId: formData.clientAccountId, incomeAccountId: formData.incomeAccountId });
              setSelectedTripIds([]);
              setEditId(null);
            }} style={fieldStyle}>
              <option value="">-- Select Client --</option>
              {companies.map(company => <option key={company.id} value={company.id}>{company.companyName}</option>)}
            </select>
          </Field>
          {selectedClientId && <Field label="Invoice Type / Billing Location">
            <select value={formData.locationId} onChange={event => {
              const location = clientLocations.find(item => String(item.id) === String(event.target.value));
              setFormData({
                ...initialInvoice,
                clientAccountId: formData.clientAccountId,
                incomeAccountId: formData.incomeAccountId,
                locationId: event.target.value,
                vendorCode: location?.company?.vendorCode || '',
                stateOfficeCode: location?.stateOfficeCode || ''
              });
              setSelectedTripIds([]);
            }} style={fieldStyle}>
              <option value="">-- Select Invoice Type --</option>
              {clientLocations.map(location => <option key={location.id} value={location.id}>{location.invoiceFormat} — {location.locationName}</option>)}
            </select>
          </Field>}
        </div>
        {selectedClientId && clientLocations.length === 0 && <div style={{ padding: '14px', marginTop: '15px', border: '1px solid #f59e0b', borderRadius: '8px', background: '#fffbeb' }}>
          <strong style={{ color: '#92400e' }}>No billing location is configured for this client.</strong>
          <p style={{ color: '#78350f', fontSize: '13px', margin: '5px 0 10px' }}>Add the Bill-To branch and choose its invoice format. The new location will be selected automatically.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
            <input value={quickLocation.locationName} onChange={event => setQuickLocation(previous => ({ ...previous, locationName: event.target.value }))} placeholder="Branch / location name" style={fieldStyle} />
            <input value={quickLocation.gstNumber} onChange={event => setQuickLocation(previous => ({ ...previous, gstNumber: event.target.value.toUpperCase() }))} placeholder="Client GSTIN" style={fieldStyle} />
            <input value={quickLocation.stateOfficeCode} onChange={event => setQuickLocation(previous => ({ ...previous, stateOfficeCode: event.target.value }))} placeholder="State Office Code (IOCL)" style={fieldStyle} />
            <select value={quickLocation.invoiceFormat} onChange={event => setQuickLocation(previous => ({ ...previous, invoiceFormat: event.target.value }))} style={fieldStyle}>
              <option value="Standard">Standard Combined Trips</option>
              <option value="IOCL INVOICE">IOCL INVOICE</option>
              <option value="BPCL INVOICE">BPCL INVOICE</option>
              <option value="Detailed">Detailed</option>
            </select>
            <textarea value={quickLocation.address} onChange={event => setQuickLocation(previous => ({ ...previous, address: event.target.value }))} placeholder="Bill-To address (use a new line for each address line)" rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>
          <button type="button" disabled={setupSaving} onClick={createQuickLocation} style={{ marginTop: '10px', padding: '9px 14px', border: 0, borderRadius: '6px', background: '#2563eb', color: 'white', fontWeight: 800, cursor: 'pointer' }}>{setupSaving ? 'Saving...' : 'Create & Select Billing Location'}</button>
        </div>}
        {setupError && <p style={{ color: '#dc2626', fontWeight: 700, marginBottom: 0 }}>{setupError}</p>}
      </div>

      {selectedLocation ? (
      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
        <h3 style={{ fontSize: '16px', color: '#1d4ed8', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
          {isIocl ? 'IOCL Invoice Form' : isBpcl ? 'BPCL Invoice Form' : 'Standard Combined-Trips Invoice Form'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
          <Field label="Invoice No">
            <input
              type="text"
              name="invoiceNo"
              value={formData.invoiceNo}
              onChange={e => setFormData({ ...formData, invoiceNo: e.target.value })}
              placeholder={isManualTaxInvoice ? 'Enter invoice number' : 'First invoice manual, then auto'}
              required={isManualTaxInvoice}
              style={fieldStyle}
            />
          </Field>
          {isManualTaxInvoice && <>
            <Field label="Period From">
              <input type="date" value={formData.periodFrom} onChange={e => setFormData({ ...formData, periodFrom: e.target.value })} required style={fieldStyle} />
            </Field>
            <Field label="Period To">
              <input type="date" value={formData.periodTo} onChange={e => setFormData({ ...formData, periodTo: e.target.value })} required style={fieldStyle} />
            </Field>
            <Field label="Transportation Mode">
              <select value={formData.transportationMode} onChange={e => setFormData({ ...formData, transportationMode: e.target.value })} style={fieldStyle}>
                <option value="By Road">By Road</option>
              </select>
            </Field>
            <Field label="Vehicle Number">
              <details style={{ position: 'relative' }}>
                <summary style={{ ...fieldStyle, backgroundColor: '#fff', cursor: 'pointer', listStyle: 'none', minHeight: '36px' }}>
                  {formData.vehicleNos.length
                    ? `${formData.vehicleNos.length} vehicle${formData.vehicleNos.length === 1 ? '' : 's'} selected ▾`
                    : '-- Select Vehicles -- ▾'}
                </summary>
                <div style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: '210px', overflowY: 'auto', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '8px', boxShadow: '0 8px 20px rgba(15, 23, 42, 0.15)' }}>
                  {vehicles.length === 0 ? <span style={{ color: '#64748b' }}>No vehicles available.</span> : vehicles.map(vehicle => (
                    <label key={vehicle.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 2px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.vehicleNos.includes(vehicle.regNo)}
                        onChange={event => setFormData(previous => ({
                          ...previous,
                          vehicleNos: event.target.checked
                            ? [...previous.vehicleNos, vehicle.regNo]
                            : previous.vehicleNos.filter(regNo => regNo !== vehicle.regNo)
                        }))}
                      />
                      <span>{vehicle.regNo}</span>
                    </label>
                  ))}
                </div>
              </details>
            </Field>
            <Field label="Product / Service">
              {isBpcl ? (
                <input
                  type="text"
                  value={formData.productService}
                  onChange={e => setFormData({ ...formData, productService: e.target.value })}
                  placeholder="Enter BPCL invoice description"
                  required
                  style={fieldStyle}
                />
              ) : (
                <select value={formData.productService} onChange={e => setFormData({ ...formData, productService: e.target.value })} style={fieldStyle}>
                  <option value="Transport Charges">Transport Charges</option>
                  <option value="Freight Charges">Freight Charges</option>
                </select>
              )}
            </Field>
            {isIocl && <>
              <Field label="Receiver State (from GSTIN)"><input value={selectedGstLocation.stateName} readOnly style={{ ...fieldStyle, backgroundColor: '#f1f5f9' }} /></Field>
              <Field label="State Code (from GSTIN)"><input value={selectedGstLocation.stateCode} readOnly style={{ ...fieldStyle, backgroundColor: '#f1f5f9' }} /></Field>
              <Field label="State Office Code"><input type="text" value={formData.stateOfficeCode} onChange={e => setFormData({ ...formData, stateOfficeCode: e.target.value })} placeholder="Enter state office code" required style={fieldStyle} /></Field>
            </>}
          </>}
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
            {isManualTaxInvoice ? (
              <select name="sacCode" value={formData.sacCode} onChange={e => setFormData({ ...formData, sacCode: e.target.value })} required style={fieldStyle}>
                <option value="">-- Select SAC --</option>
                <option value="996791">996791</option>
                <option value="996511">996511</option>
              </select>
            ) : <input type="text" name="sacCode" value={formData.sacCode} onChange={e => setFormData({ ...formData, sacCode: e.target.value })} placeholder="996511" style={fieldStyle} />}
          </Field>
          <Field label="Vendor Code">
            <input type="text" name="vendorCode" value={formData.vendorCode} onChange={e => setFormData({ ...formData, vendorCode: e.target.value })} placeholder="Client vendor code" readOnly={isManualTaxInvoice} style={{ ...fieldStyle, backgroundColor: isManualTaxInvoice ? '#f1f5f9' : 'white' }} />
          </Field>
          {!isManualTaxInvoice && <Field label="PO / MIGO">
            <input type="text" name="poMigo" value={formData.poMigo} onChange={e => setFormData({ ...formData, poMigo: e.target.value })} placeholder="PO or MIGO reference" style={fieldStyle} />
          </Field>}
          {!isManualTaxInvoice && <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', paddingBottom: '8px' }}>
            <input id="showStatus" type="checkbox" checked={formData.showStatus} onChange={e => setFormData({ ...formData, showStatus: e.target.checked })} />
            <label htmlFor="showStatus" style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Show status on invoice</label>
          </div>}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', paddingBottom: '8px' }}>
            <input id="showRoundOff" type="checkbox" checked={formData.showRoundOff} onChange={e => setFormData({ ...formData, showRoundOff: e.target.checked })} />
            <label htmlFor="showRoundOff" style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Show round off on printed invoice</label>
          </div>
          {!isManualTaxInvoice && <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Invoice Description">
              <input type="text" name="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Freight charges as per annexure" style={fieldStyle} />
            </Field>
          </div>}
        </div>

        {!isManualTaxInvoice && <>
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
        </>}

        <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>3. Taxes & Adjustments</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '25px' }}>
          <Field label="Tax Type">
            <select value={gstType} disabled style={{ ...fieldStyle, backgroundColor: '#f1f5f9' }}>
              <option value="NONE">No GST / 0%</option>
              <option value="CGST_SGST">CGST & SGST</option>
              <option value="IGST">IGST</option>
            </select>
            {num(gstPercent) > 0 && (companyGstLocation.stateCode === '-' || selectedGstLocation.stateCode === '-') && <span style={{ color: '#dc2626', fontSize: '11px' }}>Enter valid company and billing-location GSTIN values to map tax.</span>}
          </Field>
          <Field label="GST %">
            {isManualTaxInvoice ? <select value={gstPercent} onChange={e => setGstPercent(Number(e.target.value))} style={fieldStyle}>
              {[0, 5, 12, 18, 28].map(rate => <option key={rate} value={rate}>{rate}%</option>)}
            </select> : <input type="number" step="any" value={gstPercent} onChange={e => setGstPercent(e.target.value)} style={fieldStyle} />}
          </Field>
          <Field label={isManualTaxInvoice ? 'Taxable Amount' : 'Subtotal'}>
            <input type="number" min="0" step="0.01" value={isManualTaxInvoice ? formData.taxableAmount : num(formData.subTotal).toFixed(2)} onChange={isManualTaxInvoice ? e => setFormData({ ...formData, taxableAmount: e.target.value }) : undefined} readOnly={!isManualTaxInvoice} required={isManualTaxInvoice} style={{ ...fieldStyle, backgroundColor: isManualTaxInvoice ? 'white' : '#f1f5f9', fontWeight: 'bold' }} />
          </Field>
          {!isManualTaxInvoice && <Field label="Other Charges">
            <input type="number" name="otherCharges" value={formData.otherCharges} onChange={e => setFormData({ ...formData, otherCharges: e.target.value })} style={fieldStyle} />
          </Field>}
          {isManualTaxInvoice && <Field label="Declaration">
            <select value={formData.declaration} onChange={e => setFormData({ ...formData, declaration: e.target.value })} style={fieldStyle}>
              <option value={initialInvoice.declaration}>GTA forward charge declaration</option>
            </select>
          </Field>}
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
      ) : <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', backgroundColor: 'white', borderRadius: '8px', marginBottom: '40px' }}>Select a client and invoice type to open its form.</div>}

      <DataTable data={invoices} columns={columns} title="Invoice History" recycleBinType="invoices" onRecycleChanged={fetchData} onNavigateRecord={handleEdit} activeRecordId={editId} />
    </div>
  );
}
