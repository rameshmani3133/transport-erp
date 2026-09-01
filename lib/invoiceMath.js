const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function calculateIoclTotals(taxableAmount, gstPercent, gstType) {
  const subTotal = roundMoney(Math.max(Number(taxableAmount || 0), 0));
  const rate = Math.max(Number(gstPercent || 0), 0);
  const normalizedType = gstType === 'CGST_SGST' ? 'CGST_SGST' : 'IGST';
  const totalTax = roundMoney(subTotal * rate / 100);
  const cgst = normalizedType === 'CGST_SGST' ? roundMoney(totalTax / 2) : 0;
  const sgst = normalizedType === 'CGST_SGST' ? roundMoney(totalTax - cgst) : 0;
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

module.exports = { calculateIoclTotals, roundMoney };
