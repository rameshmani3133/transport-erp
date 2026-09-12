export const isEffectiveVoucher = voucher => voucher?.status === 'Posted'
  && voucher?.voucherType !== 'REVERSAL'
  && !voucher?.reversalOfId;

