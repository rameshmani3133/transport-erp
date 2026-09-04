const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function gstStateCode(gstin) {
  const value = String(gstin || '').trim().toUpperCase();
  return /^\d{2}[A-Z0-9]{13}$/.test(value) ? value.slice(0, 2) : '';
}

function resolveGstType(companyGstin, billingGstin, gstPercent) {
  const rate = Math.max(Number(gstPercent || 0), 0);
  if (rate === 0) return 'NONE';
  const companyStateCode = gstStateCode(companyGstin);
  const billingStateCode = gstStateCode(billingGstin);
  if (!companyStateCode) throw new Error('A valid 15-character company GSTIN is required for a taxable invoice.');
  if (!billingStateCode) throw new Error('A valid 15-character billing-location GSTIN is required for a taxable invoice.');
  return companyStateCode === billingStateCode ? 'CGST_SGST' : 'IGST';
}

function calculateIoclTotals(taxableAmount, gstPercent, gstType) {
  const subTotal = roundMoney(Math.max(Number(taxableAmount || 0), 0));
  const rate = Math.max(Number(gstPercent || 0), 0);
  const normalizedType = rate === 0 ? 'NONE' : gstType === 'CGST_SGST' ? 'CGST_SGST' : 'IGST';
  const totalTax = roundMoney(subTotal * rate / 100);
  const cgst = normalizedType === 'CGST_SGST' ? roundMoney(totalTax / 2) : 0;
  const sgst = normalizedType === 'CGST_SGST' ? cgst : 0;
  const igst = normalizedType === 'IGST' ? totalTax : 0;
  return {
    subTotal,
    cgst,
    sgst,
    igst,
    otherCharges: 0,
    grandTotal: roundMoney(subTotal + cgst + sgst + igst),
    advanceReceived: 0,
    gstType: normalizedType,
    gstPercent: rate
  };
}

module.exports = { calculateIoclTotals, roundMoney, gstStateCode, resolveGstType };
