const { text } = require('./coerce');

function jsonSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

async function purgeAuthorizedVoucherPair(prisma) {
  const setting = text(process.env.ONE_TIME_PURGE_VOUCHER_PAIR);
  if (!setting) return;

  const [originalVoucherNo, reversalVoucherNo] = setting.split(',').map(value => value.trim());
  if (!originalVoucherNo || !reversalVoucherNo) {
    throw new Error('ONE_TIME_PURGE_VOUCHER_PAIR must contain original,reversal voucher numbers.');
  }

  const result = await prisma.$transaction(async tx => {
    const vouchers = await tx.voucher.findMany({
      where: { voucherNo: { in: [originalVoucherNo, reversalVoucherNo] } },
      include: { lines: true, ledgerEntries: true }
    });
    if (vouchers.length === 0) return { alreadyRemoved: true };
    if (vouchers.length !== 2) throw new Error('Voucher pair validation failed: both records were not found.');

    const original = vouchers.find(voucher => voucher.voucherNo === originalVoucherNo);
    const reversal = vouchers.find(voucher => voucher.voucherNo === reversalVoucherNo);
    if (!original || !reversal) throw new Error('Voucher pair validation failed: voucher numbers do not match.');
    if (original.tenantKey !== reversal.tenantKey) throw new Error('Voucher pair validation failed: tenant mismatch.');
    if (original.voucherType !== 'LOAN_EMI' || original.status !== 'Reversed') throw new Error('Voucher pair validation failed: original is not a reversed loan EMI.');
    if (reversal.voucherType !== 'REVERSAL' || reversal.status !== 'Posted' || reversal.reversalOfId !== original.id) throw new Error('Voucher pair validation failed: reversal linkage is invalid.');
    if (original.sourceType !== 'Loan' || !original.sourceId) throw new Error('Voucher pair validation failed: linked loan was not found.');
    if (!original.lines.length || !reversal.lines.length || !original.ledgerEntries.length || !reversal.ledgerEntries.length) throw new Error('Voucher pair validation failed: accounting entries are incomplete.');

    const otherReversals = await tx.voucher.count({ where: { reversalOfId: original.id, id: { not: reversal.id } } });
    if (otherReversals) throw new Error('Voucher pair validation failed: another reversal is linked to the original.');
    const loan = await tx.loan.findFirst({ where: { id: original.sourceId, tenantKey: original.tenantKey } });
    if (!loan) throw new Error('Voucher pair validation failed: linked loan does not exist.');

    await tx.auditLog.create({
      data: {
        tenantKey: original.tenantKey,
        action: 'PURGE_MISTAKEN_VOUCHER_PAIR',
        entity: 'Voucher',
        entityId: `${original.id},${reversal.id}`,
        details: jsonSnapshot({ original, reversal, retainedLoan: { id: loan.id, loanNo: loan.loanNo, outstandingAmount: loan.outstandingAmount, nextDueDate: loan.nextDueDate, status: loan.status } })
      }
    });
    await tx.ledgerEntry.deleteMany({ where: { voucherId: { in: [original.id, reversal.id] } } });
    await tx.voucherLine.deleteMany({ where: { voucherId: { in: [original.id, reversal.id] } } });
    await tx.voucher.delete({ where: { id: reversal.id } });
    await tx.voucher.delete({ where: { id: original.id } });

    return { alreadyRemoved: false, tenantKey: original.tenantKey, loanId: loan.id, outstandingAmount: loan.outstandingAmount };
  });

  if (result.alreadyRemoved) console.log('Authorized voucher pair was already removed.');
  else console.log(`Authorized voucher pair removed; loan ${result.loanId} retained with outstanding balance ${result.outstandingAmount}.`);
}

module.exports = { purgeAuthorizedVoucherPair };
