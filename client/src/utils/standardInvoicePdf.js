const number = value => Number(value || 0);
const amount = value => `Rs. ${number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = value => value ? new Date(value).toLocaleDateString('en-IN') : '-';
const safeName = value => String(value || 'invoice').replace(/[^a-z0-9_-]+/gi, '_');
const netWeight = trip => Math.max(number(trip.billWeight), number(trip.guaranteeWeight));
const freight = trip => Math.max(number(trip.totalClientBill) - number(trip.clientExtraSizeCharge) - number(trip.haltingCharge), 0);

export function createStandardInvoicePdf({ invoice, profile = {}, amountInWords }) {
  const JsPDF = window.jspdf?.jsPDF;
  if (!JsPDF) throw new Error('PDF component is unavailable. Refresh the page and try again.');
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const trips = invoice.trips || [];
  const supplier = profile.companyName || 'Company';
  const client = invoice.location?.company?.companyName || 'Client';
  const location = invoice.location?.locationName || '-';
  const left = 10;
  const width = 190;
  const text = (value, x, y, options = {}) => doc.text(String(value ?? '-'), x, y, options);
  const wrapped = (value, maxWidth) => doc.splitTextToSize(String(value || '-'), maxWidth);
  const line = y => doc.line(left, y, left + width, y);
  const row = (label, value, y, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    text(label, 132, y);
    text(amount(value), 197, y, { align: 'right' });
  };

  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(0.4);
  doc.rect(left, 8, width, 281);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); text('TAX INVOICE', 105, 15, { align: 'center' });
  line(18);
  doc.setFontSize(18); text(supplier.toUpperCase(), 105, 26, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  text(wrapped(profile.address || '-', 150), 105, 31, { align: 'center' });
  text(`GSTIN: ${profile.gstNumber || '-'}    PAN: ${profile.panNumber || '-'}`, 105, 41, { align: 'center' });
  line(45); doc.line(128, 45, 128, 90);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); text('BILL TO', 14, 51);
  doc.setFontSize(11); text(client.toUpperCase(), 14, 57);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  text(wrapped(`${location}\n${invoice.location?.address || '-'}`, 108), 14, 63);
  text(`GSTIN: ${invoice.location?.gstNumber || '-'}`, 14, 84);
  const meta = [
    ['Invoice No', invoice.invoiceNo || '-'], ['Invoice Date', date(invoice.date)],
    ['Due Date', date(invoice.dueDate)], ['Tax Type', number(invoice.igst) > 0 ? 'IGST' : 'CGST + SGST']
  ];
  meta.forEach(([label, value], index) => {
    const y = 52 + index * 9;
    doc.setFont('helvetica', 'bold'); text(label, 132, y);
    doc.setFont('helvetica', 'normal'); text(value, 158, y);
  });
  line(90);
  const headers = ['S.No', 'Description', 'SAC', 'Vendor', 'PO / MIGO', 'Trips', 'Taxable Value'];
  const xs = [10, 22, 93, 111, 134, 163, 178, 200];
  doc.setFillColor(241, 245, 249); doc.rect(10, 90, 190, 10, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  headers.forEach((header, index) => text(header, (xs[index] + xs[index + 1]) / 2, 96, { align: 'center' }));
  xs.slice(1, -1).forEach(x => doc.line(x, 90, x, 120)); line(100); line(120);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  text('1', 16, 107, { align: 'center' });
  text(wrapped(invoice.description || `Freight charges for ${trips.length} trips as per annexure`, 66), 25, 106);
  text(invoice.sacCode || '-', 102, 107, { align: 'center' }); text(invoice.vendorCode || '-', 122.5, 107, { align: 'center' });
  text(invoice.poMigo || '-', 148.5, 107, { align: 'center' }); text(String(trips.length), 170.5, 107, { align: 'center' });
  text(amount(invoice.subTotal), 197, 107, { align: 'right' });
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); text('Amount Chargeable', 14, 132);
  doc.setFont('helvetica', 'normal'); text(wrapped(amountInWords(invoice.grandTotal), 104), 14, 138);
  doc.rect(128, 124, 72, 75);
  row('Subtotal', invoice.subTotal, 132);
  row('CGST', invoice.cgst, 142); row('SGST', invoice.sgst, 152); row('IGST', invoice.igst, 162);
  row('Other Charges', invoice.otherCharges, 172);
  const calculated = number(invoice.grandTotal) - (number(invoice.subTotal) + number(invoice.cgst) + number(invoice.sgst) + number(invoice.igst) + number(invoice.otherCharges));
  if (invoice.showRoundOff !== false && Math.abs(calculated) >= 0.005) row('Round Off', calculated, 182);
  row('Grand Total', invoice.grandTotal, 193, true);
  line(207); doc.line(125, 207, 125, 288);
  doc.setFont('helvetica', 'bold'); text('BANK & PAYMENT DETAILS', 14, 216);
  doc.setFont('helvetica', 'normal');
  text(`Bank: ${profile.bankName || '-'}`, 14, 225); text(`Account No: ${profile.accountNumber || '-'}`, 14, 234); text(`IFSC: ${profile.ifscCode || '-'}`, 14, 243);
  doc.setFont('helvetica', 'bold'); text(`For ${supplier}`, 162, 216, { align: 'center' });
  text(profile.signatoryRole || 'Authorized Signatory', 162, 276, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); text('This is a computer generated invoice.', 14, 282);

  const columns = [
    ['#', 7], ['Date', 16], ['Truck', 19], ['From', 21], ['To', 21], ['LxWxH', 19],
    ['Bill Wt.', 16], ['Guar. Wt.', 16], ['Net Wt.', 16], ['Freight', 22], ['Rate', 22], ['ODC', 19], ['Halting', 19], ['Balance', 22]
  ];
  const drawAnnexureHeader = pageNo => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); text('ANNEXURE', 10, 11);
    doc.setFontSize(8); text(`${supplier} | ${invoice.invoiceNo || '-'} | ${client} - ${location}`, 10, 17);
    text(`Page ${pageNo}`, 287, 17, { align: 'right' });
    doc.setFillColor(226, 232, 240); doc.rect(8, 21, 281, 10, 'F');
    let x = 8;
    doc.setFontSize(6.5);
    columns.forEach(([label, colWidth]) => { doc.rect(x, 21, colWidth, 10); text(label, x + colWidth / 2, 27, { align: 'center' }); x += colWidth; });
  };
  let pageNo = 2;
  doc.addPage('a4', 'landscape'); drawAnnexureHeader(pageNo);
  let y = 31;
  const rowHeight = 9;
  trips.forEach((trip, index) => {
    if (y + rowHeight > 192) { pageNo += 1; doc.addPage('a4', 'landscape'); drawAnnexureHeader(pageNo); y = 31; }
    const values = [index + 1, date(trip.date), trip.vehicle?.regNo || '-', trip.route?.fromLocation || '-', trip.route?.toLocation || '-',
      [trip.length, trip.width, trip.height].map(v => v || '-').join('x'), number(trip.billWeight).toFixed(2), number(trip.guaranteeWeight).toFixed(2), netWeight(trip).toFixed(2),
      amount(freight(trip)), trip.clientCalcType === 'Fixed' ? `${amount(trip.clientRate)} Fixed` : `${amount(trip.clientRate)}/T`, amount(trip.clientExtraSizeCharge), amount(trip.haltingCharge), amount(trip.totalClientBill)];
    let x = 8; doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
    columns.forEach(([, colWidth], colIndex) => { doc.rect(x, y, colWidth, rowHeight); text(wrapped(values[colIndex], colWidth - 1), x + (colIndex === 0 ? colWidth / 2 : 1), y + 3.5, colIndex === 0 ? { align: 'center' } : {}); x += colWidth; });
    y += rowHeight;
  });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); text(`Total Taxable Amount: ${amount(invoice.subTotal)}`, 287, Math.min(y + 7, 198), { align: 'right' });
  return doc;
}

export function downloadStandardInvoicePdf(options) {
  const doc = createStandardInvoicePdf(options);
  doc.save(`${safeName(options.invoice.invoiceNo)}_invoice.pdf`);
}
