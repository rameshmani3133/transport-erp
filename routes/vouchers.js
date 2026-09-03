const crypto = require('crypto');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { ensureNamedAccount, ensureStandardAccountingAccounts } = require('../lib/accountingAccounts');
const { toNumber, toInt, toDate, text } = require('../lib/coerce');

const router = express.Router();
const prisma = new PrismaClient();
const TYPES = new Set([
  'CLIENT_RECEIPT', 'OTHER_INCOME_RECEIPT', 'LOAN_RECEIPT', 'CAPITAL_INTRODUCED',
  'VENDOR_PAYMENT', 'PUMP_PAYMENT', 'DRIVER_ADVANCE', 'DRIVER_SALARY_PAYMENT',
  'LOAN_EMI', 'MONTHLY_BILL_PAYMENT', 'MONTHLY_BILL_ACCRUAL', 'BILL_PAYABLE_PAYMENT',
  'EXPENSE_PAYMENT', 'ASSET_PURCHASE', 'TAX_PAYMENT', 'ACCOUNT_TRANSFER',
  'OWNER_DRAWINGS', 'CLIENT_REFUND', 'VENDOR_REFUND', 'GENERAL_JOURNAL'
]);
const PREFIXES = {
  CLIENT_RECEIPT: 'CR', OTHER_INCOME_RECEIPT: 'OR', LOAN_RECEIPT: 'LR', CAPITAL_INTRODUCED: 'CI',
  VENDOR_PAYMENT: 'VP', PUMP_PAYMENT: 'FP', DRIVER_ADVANCE: 'DA', DRIVER_SALARY_PAYMENT: 'DS',
  LOAN_EMI: 'LE', MONTHLY_BILL_PAYMENT: 'MB', MONTHLY_BILL_ACCRUAL: 'BA', BILL_PAYABLE_PAYMENT: 'BP',
  EXPENSE_PAYMENT: 'EP', ASSET_PURCHASE: 'AP', TAX_PAYMENT: 'TP', ACCOUNT_TRANSFER: 'CT',
  OWNER_DRAWINGS: 'OD', CLIENT_REFUND: 'RF', VENDOR_REFUND: 'VR', GENERAL_JOURNAL: 'JV', REVERSAL: 'RV'
};

const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const positive = (value, label) => {
  const amount = round(toNumber(value));
  if (!(amount > 0)) throw new Error(`${label} must be greater than zero.`);
  return amount;
};
const optionalAmount = value => Math.max(0, round(toNumber(value)));
const line = (accountId, type, amount, description) => ({ accountId, type, amount: round(amount), description });

function dateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Due date is invalid.');
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function nextMonthlyDate(value, dueDay) {
  const source = dateParts(value);
  const day = Math.max(1, Math.min(31, Number(dueDay || source.day)));
  const last = new Date(Date.UTC(source.year, source.month + 2, 0)).getUTCDate();
  return new Date(Date.UTC(source.year, source.month + 1, Math.min(day, last)));
}

async function account(tx, req, id, label, predicate) {
  const accountId = toInt(id);
  if (!Number.isInteger(accountId)) throw new Error(`${label} is required.`);
  const found = await tx.account.findFirst({ where: withTenant(req, { id: accountId }) });
  if (!found) throw new Error(`${label} was not found for this company.`);
  if (predicate && !predicate(found)) throw new Error(`${found.accountName} is not a valid ${label.toLowerCase()}.`);
  return found;
}

const isCashBank = item => item.accountGroup?.includes('Cash') || item.accountGroup?.includes('Bank');
const isExpense = item => item.accountType === 'Expense';
const isIncome = item => item.accountType === 'Income';
const isAsset = item => item.accountType === 'Asset';
const isLiability = item => item.accountType === 'Liability';
const isClient = item => item.accountGroup?.includes('Sundry Debtors');
const isVendor = item => item.accountGroup?.includes('Sundry Creditors');
const isTax = item => item.accountGroup?.includes('Tax') || item.accountGroup?.includes('Duties');

async function expenseForBill(tx, req, bill, requestedId, standard) {
  if (requestedId || bill.expenseAccountId) return account(tx, req, requestedId || bill.expenseAccountId, 'Expense account', isExpense);
  const names = {
    Rent: 'Office Rent Expense', 'Electricity / EB': 'Electricity Expense', Water: 'Utilities Expense',
    Internet: 'Internet & Telephone Expense', Telephone: 'Internet & Telephone Expense', Insurance: 'Insurance Expense',
    Subscription: 'Subscription Expense', Maintenance: 'Repairs & Maintenance Expense',
    'Tax / License': 'Tax & License Expense', Other: 'Other Administrative Expense'
  };
  return standard[names[bill.category] || 'Other Administrative Expense'];
}

async function buildPosting(tx, req, d) {
  const type = text(d.type);
  if (!TYPES.has(type)) throw new Error('Select a valid voucher type.');
  const standard = await ensureStandardAccountingAccounts(tx, req);
  const cash = async () => account(tx, req, d.cashBankAccountId, 'Cash / bank account', isCashBank);
  const amount = () => positive(d.amount, 'Amount');
  const result = { type, lines: [], totalAmount: 0, sourceType: null, sourceId: null, metadata: {} };

  if (type === 'CLIENT_RECEIPT') {
    const bank = await cash();
    const party = await account(tx, req, d.partyAccountId, 'Client account', isClient);
    const total = amount();
    result.lines = [line(bank.id, 'Dr', total, 'Amount received'), line(party.id, 'Cr', total, 'Client balance settled')];
    const invoiceId = toInt(d.invoiceId);
    if (invoiceId) {
      const invoice = await tx.invoice.findFirst({ where: withTenant(req, { id: invoiceId }), include: { location: true } });
      if (!invoice) throw new Error('Selected invoice was not found.');
      if (party.clientId && invoice.location?.companyId && party.clientId !== invoice.location.companyId) throw new Error('Selected client ledger does not belong to this invoice.');
      if (total > round(invoice.balanceAmount) + 0.001) throw new Error('Receipt cannot exceed the selected invoice balance.');
      result.sourceType = 'Invoice'; result.sourceId = invoice.id;
      result.metadata = { previousTotalPaid: invoice.totalPaid, previousBalanceAmount: invoice.balanceAmount, previousStatus: invoice.status };
    }
    result.totalAmount = total;
  } else if (type === 'OTHER_INCOME_RECEIPT') {
    const bank = await cash(); const income = await account(tx, req, d.incomeAccountId, 'Income account', isIncome); const total = amount();
    result.lines = [line(bank.id, 'Dr', total, 'Income received'), line(income.id, 'Cr', total, 'Income recognized')]; result.totalAmount = total;
  } else if (type === 'LOAN_RECEIPT') {
    const bank = await cash();
    const loanId = toInt(d.loanId); const loan = await tx.loan.findFirst({ where: withTenant(req, { id: loanId }) });
    if (!loan) throw new Error('Select a valid loan.');
    let loanAccount = loan.financeAccountId ? await account(tx, req, loan.financeAccountId, 'Loan liability account', isLiability) : null;
    if (!loanAccount) {
      loanAccount = await ensureNamedAccount(tx, req, `${loan.lenderName}${loan.loanNo ? ` - ${loan.loanNo}` : ''} - Loan`, { accountType: 'Liability', accountGroup: 'Loans (Liability)', balanceType: 'Cr' });
      await tx.loan.update({ where: { id: loan.id }, data: { financeAccountId: loanAccount.id } });
    }
    const received = amount(); const charges = optionalAmount(d.chargesAmount); const liability = round(received + charges);
    result.lines = [line(bank.id, 'Dr', received, 'Loan proceeds received')];
    if (charges) result.lines.push(line(standard['Loan Processing & Penalty Charges'].id, 'Dr', charges, 'Loan charges deducted'));
    result.lines.push(line(loanAccount.id, 'Cr', liability, 'Loan liability recognized'));
    result.totalAmount = liability; result.sourceType = 'Loan'; result.sourceId = loan.id;
  } else if (type === 'CAPITAL_INTRODUCED') {
    const bank = await cash(); const capital = d.partyAccountId ? await account(tx, req, d.partyAccountId, 'Capital account', item => item.accountType === 'Equity') : standard['Capital Account']; const total = amount();
    result.lines = [line(bank.id, 'Dr', total, 'Capital received'), line(capital.id, 'Cr', total, 'Owner capital')]; result.totalAmount = total;
  } else if (['VENDOR_PAYMENT', 'PUMP_PAYMENT'].includes(type)) {
    const creditorCheck = type === 'PUMP_PAYMENT' ? item => item.accountGroup?.includes('Fuel Pump') : item => item.accountGroup?.includes('Vendors');
    const bank = await cash(); const party = await account(tx, req, d.partyAccountId, 'Creditor account', creditorCheck); const total = amount(); const tds = optionalAmount(d.tdsAmount);
    if (tds >= total) throw new Error('TDS must be less than the payable amount.');
    result.lines = [line(party.id, 'Dr', total, 'Creditor balance settled'), line(bank.id, 'Cr', total - tds, 'Amount paid')];
    if (tds) result.lines.push(line(standard['TDS Payable'].id, 'Cr', tds, 'TDS withheld'));
    result.totalAmount = total;
  } else if (type === 'DRIVER_ADVANCE') {
    const bank = await cash(); const party = await account(tx, req, d.partyAccountId, 'Driver advance account', item => item.accountGroup?.includes('Loans & Advances')); const total = amount();
    result.lines = [line(party.id, 'Dr', total, 'Driver advance'), line(bank.id, 'Cr', total, 'Advance paid')]; result.totalAmount = total;
  } else if (type === 'DRIVER_SALARY_PAYMENT') {
    const bank = await cash(); const party = await account(tx, req, d.partyAccountId, 'Driver payable account', item => item.accountGroup?.includes('Driver/Payroll Payable') || item.accountName === 'Driver Payable'); const total = amount();
    result.lines = [line(party.id, 'Dr', total, 'Driver payable settled'), line(bank.id, 'Cr', total, 'Salary paid')]; result.totalAmount = total;
  } else if (type === 'LOAN_EMI') {
    const bank = await cash(); const loanId = toInt(d.loanId); const loan = await tx.loan.findFirst({ where: withTenant(req, { id: loanId }) });
    if (!loan) throw new Error('Select a valid active loan.');
    let loanAccount = loan.financeAccountId ? await account(tx, req, loan.financeAccountId, 'Loan liability account', isLiability) : null;
    if (!loanAccount) throw new Error('Map a liability ledger to this loan before posting EMI.');
    const principal = positive(d.principalAmount, 'Principal component'); const interest = optionalAmount(d.interestAmount); const charges = optionalAmount(d.chargesAmount); const total = round(principal + interest + charges);
    if (principal > round(loan.outstandingAmount) + 0.001) throw new Error('Principal component cannot exceed loan outstanding.');
    result.lines = [line(loanAccount.id, 'Dr', principal, 'Loan principal repaid')];
    if (interest) result.lines.push(line(standard['Interest on Loans'].id, 'Dr', interest, 'Loan interest'));
    if (charges) result.lines.push(line(standard['Loan Processing & Penalty Charges'].id, 'Dr', charges, 'Loan penalty / charges'));
    result.lines.push(line(bank.id, 'Cr', total, 'EMI paid'));
    result.totalAmount = total; result.sourceType = 'Loan'; result.sourceId = loan.id;
    result.metadata = { principal, previousOutstandingAmount: loan.outstandingAmount, previousNextDueDate: loan.nextDueDate, previousPaidDate: loan.paidDate, previousPaymentStatus: loan.paymentStatus, previousStatus: loan.status };
  } else if (['MONTHLY_BILL_PAYMENT', 'MONTHLY_BILL_ACCRUAL'].includes(type)) {
    const billId = toInt(d.recurringBillId); const bill = await tx.recurringBill.findFirst({ where: withTenant(req, { id: billId }) });
    if (!bill) throw new Error('Select a valid monthly bill.');
    const expense = await expenseForBill(tx, req, bill, d.expenseAccountId, standard);
    const taxable = positive(d.taxableAmount || d.amount, 'Taxable / expense amount');
    const cgst = optionalAmount(d.cgst); const sgst = optionalAmount(d.sgst); const igst = optionalAmount(d.igst); const tds = optionalAmount(d.tdsAmount);
    const gross = round(taxable + cgst + sgst + igst); if (tds > gross) throw new Error('TDS cannot exceed the bill total.');
    const credit = type === 'MONTHLY_BILL_PAYMENT'
      ? await cash()
      : await account(tx, req, d.payableAccountId || bill.payableAccountId || standard['Bills Payable'].id, 'Bill payable account', item => isLiability(item) && (item.accountGroup?.includes('Current Liabilities') || item.accountName === 'Bills Payable'));
    result.lines = [line(expense.id, 'Dr', taxable, 'Monthly expense')];
    if (cgst) result.lines.push(line(standard['Input CGST'].id, 'Dr', cgst, 'Input CGST'));
    if (sgst) result.lines.push(line(standard['Input SGST'].id, 'Dr', sgst, 'Input SGST'));
    if (igst) result.lines.push(line(standard['Input IGST'].id, 'Dr', igst, 'Input IGST'));
    result.lines.push(line(credit.id, 'Cr', gross - tds, type === 'MONTHLY_BILL_PAYMENT' ? 'Bill paid' : 'Bill accrued'));
    if (tds) result.lines.push(line(standard['TDS Payable'].id, 'Cr', tds, 'TDS withheld'));
    result.totalAmount = gross; result.sourceType = 'RecurringBill'; result.sourceId = bill.id;
    result.metadata = { previousNextDueDate: bill.nextDueDate, previousLastPaidDate: bill.lastPaidDate, previousPaymentStatus: bill.paymentStatus, previousStatus: bill.status, dueDate: bill.nextDueDate, expenseAccountId: expense.id, payableAccountId: type === 'MONTHLY_BILL_ACCRUAL' ? credit.id : bill.payableAccountId };
  } else if (type === 'BILL_PAYABLE_PAYMENT') {
    const bank = await cash(); const payable = await account(tx, req, d.partyAccountId, 'Bill payable account', item => item.accountGroup?.includes('Current Liabilities')); const total = amount();
    result.lines = [line(payable.id, 'Dr', total, 'Bill payable settled'), line(bank.id, 'Cr', total, 'Bill paid')]; result.totalAmount = total;
  } else if (type === 'EXPENSE_PAYMENT') {
    const bank = await cash(); const expense = await account(tx, req, d.expenseAccountId, 'Expense account', isExpense); const total = amount();
    result.lines = [line(expense.id, 'Dr', total, 'Expense recognized'), line(bank.id, 'Cr', total, 'Expense paid')]; result.totalAmount = total;
  } else if (type === 'ASSET_PURCHASE') {
    const asset = await account(tx, req, d.assetAccountId, 'Asset account', item => isAsset(item) && !isCashBank(item));
    const counter = await account(tx, req, d.counterAccountId || d.cashBankAccountId, 'Payment / supplier account', item => isCashBank(item) || isLiability(item));
    const taxable = positive(d.taxableAmount || d.amount, 'Asset value'); const cgst = optionalAmount(d.cgst); const sgst = optionalAmount(d.sgst); const igst = optionalAmount(d.igst); const total = round(taxable + cgst + sgst + igst);
    result.lines = [line(asset.id, 'Dr', taxable, 'Asset acquired')];
    if (cgst) result.lines.push(line(standard['Input CGST'].id, 'Dr', cgst, 'Input CGST'));
    if (sgst) result.lines.push(line(standard['Input SGST'].id, 'Dr', sgst, 'Input SGST'));
    if (igst) result.lines.push(line(standard['Input IGST'].id, 'Dr', igst, 'Input IGST'));
    result.lines.push(line(counter.id, 'Cr', total, 'Asset purchase consideration')); result.totalAmount = total;
  } else if (type === 'TAX_PAYMENT') {
    const bank = await cash(); const tax = await account(tx, req, d.partyAccountId, 'Tax payable account', item => isLiability(item) && isTax(item)); const total = amount();
    result.lines = [line(tax.id, 'Dr', total, 'Tax liability settled'), line(bank.id, 'Cr', total, 'Tax paid')]; result.totalAmount = total;
  } else if (type === 'ACCOUNT_TRANSFER') {
    const from = await account(tx, req, d.cashBankAccountId, 'Source cash / bank account', isCashBank); const to = await account(tx, req, d.destinationAccountId, 'Destination cash / bank account', isCashBank); const total = amount();
    if (from.id === to.id) throw new Error('Source and destination accounts must be different.');
    result.lines = [line(to.id, 'Dr', total, 'Transfer received'), line(from.id, 'Cr', total, 'Transfer sent')]; result.totalAmount = total;
  } else if (type === 'OWNER_DRAWINGS') {
    const bank = await cash(); const drawings = d.partyAccountId ? await account(tx, req, d.partyAccountId, 'Drawings account', item => item.accountType === 'Equity') : standard['Owner Drawings']; const total = amount();
    result.lines = [line(drawings.id, 'Dr', total, 'Owner drawings'), line(bank.id, 'Cr', total, 'Amount withdrawn')]; result.totalAmount = total;
  } else if (type === 'CLIENT_REFUND') {
    const bank = await cash(); const party = await account(tx, req, d.partyAccountId, 'Client account', isClient); const total = amount();
    result.lines = [line(party.id, 'Dr', total, 'Client refund'), line(bank.id, 'Cr', total, 'Refund paid')]; result.totalAmount = total;
  } else if (type === 'VENDOR_REFUND') {
    const bank = await cash(); const party = await account(tx, req, d.partyAccountId, 'Vendor account', isVendor); const total = amount();
    result.lines = [line(bank.id, 'Dr', total, 'Vendor refund received'), line(party.id, 'Cr', total, 'Vendor balance adjusted')]; result.totalAmount = total;
  } else if (type === 'GENERAL_JOURNAL') {
    if (!Array.isArray(d.lines) || d.lines.length < 2) throw new Error('Enter at least two journal lines.');
    for (const item of d.lines) {
      const selected = await account(tx, req, item.accountId, 'Journal account');
      if (!['Dr', 'Cr'].includes(item.type)) throw new Error('Every journal line must be Debit or Credit.');
      result.lines.push(line(selected.id, item.type, positive(item.amount, 'Journal line amount'), text(item.description, null)));
    }
    result.totalAmount = round(result.lines.filter(item => item.type === 'Dr').reduce((sum, item) => sum + item.amount, 0));
  }

  const debit = round(result.lines.filter(item => item.type === 'Dr').reduce((sum, item) => sum + item.amount, 0));
  const credit = round(result.lines.filter(item => item.type === 'Cr').reduce((sum, item) => sum + item.amount, 0));
  if (!result.lines.length || debit !== credit) throw new Error(`Voucher is not balanced. Debit ${debit.toFixed(2)} must equal credit ${credit.toFixed(2)}.`);
  result.totalAmount = debit;
  return result;
}

async function createVoucher(tx, req, d, posting, reversalOfId = null) {
  const date = toDate(d.date);
  if (!date) throw new Error('Voucher date is required.');
  const temporaryNo = `TMP-${crypto.randomUUID()}`;
  const voucher = await tx.voucher.create({ data: {
    tenantKey: req.tenantKey, voucherNo: temporaryNo, voucherType: posting.type, date, status: 'Posted',
    requestKey: text(d.requestKey, null),
    totalAmount: posting.totalAmount, paymentMode: text(d.paymentMode, null), referenceNo: text(d.referenceNo, null),
    narration: text(d.narration) || posting.type.replace(/_/g, ' '), remarks: text(d.remarks, null),
    sourceType: posting.sourceType, sourceId: posting.sourceId, metadata: posting.metadata || {}, reversalOfId
  }});
  const year = date.getUTCFullYear();
  const voucherNo = `${PREFIXES[posting.type] || 'VCH'}-${year}-${String(voucher.id).padStart(6, '0')}`;
  await tx.voucher.update({ where: { id: voucher.id }, data: { voucherNo } });
  await tx.voucherLine.createMany({ data: posting.lines.map(item => ({ ...item, tenantKey: req.tenantKey, voucherId: voucher.id })) });
  await tx.ledgerEntry.createMany({ data: posting.lines.map(item => ({ tenantKey: req.tenantKey, voucherId: voucher.id, accountId: item.accountId, type: item.type, amount: item.amount, date, narration: `${text(d.narration) || posting.type.replace(/_/g, ' ')} [${voucherNo}]` })) });
  return { ...voucher, voucherNo };
}

async function applySource(tx, req, voucher, posting, d) {
  if (posting.sourceType === 'Invoice') {
    const invoice = await tx.invoice.findFirst({ where: withTenant(req, { id: posting.sourceId }) });
    await tx.invoicePayment.create({ data: { tenantKey: req.tenantKey, invoiceId: invoice.id, paymentDate: voucher.date, amount: voucher.totalAmount, paymentMode: text(d.paymentMode, 'Bank'), referenceNo: voucher.voucherNo, remarks: text(d.remarks, null) } });
    const totalPaid = round(toNumber(invoice.totalPaid) + voucher.totalAmount); const balanceAmount = Math.max(0, round(toNumber(invoice.grandTotal) - totalPaid));
    await tx.invoice.update({ where: { id: invoice.id }, data: { totalPaid, balanceAmount, status: balanceAmount <= 0 ? 'Paid' : 'Unpaid' } });
  }
  if (posting.type === 'LOAN_EMI') {
    const loan = await tx.loan.findFirst({ where: withTenant(req, { id: posting.sourceId }) });
    const outstandingAmount = Math.max(0, round(toNumber(loan.outstandingAmount) - posting.metadata.principal));
    const nextDueDate = nextMonthlyDate(loan.nextDueDate, loan.dueDay); const closed = outstandingAmount <= 0;
    await tx.loan.update({ where: { id: loan.id }, data: { outstandingAmount, nextDueDate, paidDate: voucher.date, paymentStatus: closed ? 'Paid' : 'Due', status: closed ? 'Closed' : loan.status } });
  }
  if (['MONTHLY_BILL_PAYMENT', 'MONTHLY_BILL_ACCRUAL'].includes(posting.type)) {
    const bill = await tx.recurringBill.findFirst({ where: withTenant(req, { id: posting.sourceId }) });
    const nextDueDate = nextMonthlyDate(bill.nextDueDate, bill.dueDay); const closed = bill.endDate && nextDueDate > bill.endDate;
    if (posting.type === 'MONTHLY_BILL_PAYMENT') await tx.recurringBillPayment.create({ data: { tenantKey: req.tenantKey, recurringBillId: bill.id, dueDate: bill.nextDueDate, paidDate: voucher.date, amount: voucher.totalAmount, paymentMode: text(d.paymentMode, null), referenceNumber: voucher.voucherNo, remarks: text(d.remarks, null) } });
    await tx.recurringBill.update({ where: { id: bill.id }, data: { expenseAccountId: posting.metadata.expenseAccountId || null, payableAccountId: posting.metadata.payableAccountId || null, lastPaidDate: posting.type === 'MONTHLY_BILL_PAYMENT' ? voucher.date : bill.lastPaidDate, nextDueDate, paymentStatus: closed ? 'Paid' : 'Due', status: closed ? 'Closed' : bill.status } });
  }
}

async function restoreSource(tx, req, original) {
  const meta = original.metadata || {};
  if (original.sourceType === 'Invoice') {
    await tx.invoicePayment.updateMany({ where: withTenant(req, { invoiceId: original.sourceId, referenceNo: original.voucherNo }), data: { deletedAt: new Date() } });
    const invoice = await tx.invoice.findFirst({ where: withTenant(req, { id: original.sourceId }) });
    const payments = await tx.invoicePayment.findMany({ where: withTenant(req, { invoiceId: original.sourceId }) });
    const totalPaid = round(toNumber(invoice?.advanceReceived) + payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0));
    const balanceAmount = Math.max(0, round(toNumber(invoice?.grandTotal) - totalPaid));
    await tx.invoice.updateMany({ where: withTenant(req, { id: original.sourceId }), data: { totalPaid, balanceAmount, status: balanceAmount <= 0 ? 'Paid' : 'Unpaid' } });
  }
  if (original.voucherType === 'LOAN_EMI') await tx.loan.updateMany({ where: withTenant(req, { id: original.sourceId }), data: { outstandingAmount: toNumber(meta.previousOutstandingAmount), nextDueDate: toDate(meta.previousNextDueDate), paidDate: toDate(meta.previousPaidDate), paymentStatus: meta.previousPaymentStatus || 'Due', status: meta.previousStatus || 'Active' } });
  if (['MONTHLY_BILL_PAYMENT', 'MONTHLY_BILL_ACCRUAL'].includes(original.voucherType)) {
    if (original.voucherType === 'MONTHLY_BILL_PAYMENT') await tx.recurringBillPayment.updateMany({ where: withTenant(req, { recurringBillId: original.sourceId, referenceNumber: original.voucherNo }), data: { deletedAt: new Date() } });
    await tx.recurringBill.updateMany({ where: withTenant(req, { id: original.sourceId }), data: { nextDueDate: toDate(meta.previousNextDueDate), lastPaidDate: toDate(meta.previousLastPaidDate), paymentStatus: meta.previousPaymentStatus || 'Due', status: meta.previousStatus || 'Active' } });
  }
}

router.get('/', async (req, res) => {
  try {
    const vouchers = await prisma.voucher.findMany({ where: withTenant(req), include: { lines: { include: { account: true }, orderBy: { id: 'asc' } }, reversalOf: { select: { voucherNo: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
    res.json(vouchers);
  } catch (error) { console.error('Voucher fetch error:', error); res.status(500).json({ error: 'Failed to fetch vouchers.' }); }
});

router.post('/', async (req, res) => {
  try {
    const voucher = await prisma.$transaction(async tx => {
      const requestKey = text(req.body.requestKey, null);
      if (requestKey) {
        const existing = await tx.voucher.findFirst({ where: withTenant(req, { requestKey }) });
        if (existing) return existing;
      }
      const posting = await buildPosting(tx, req, req.body); const created = await createVoucher(tx, req, req.body, posting); await applySource(tx, req, created, posting, req.body); return created;
    });
    res.json(voucher);
  } catch (error) { console.error('Voucher posting error:', error); res.status(400).json({ error: error.message || 'Failed to post voucher.' }); }
});

router.post('/:id/reverse', async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const result = await prisma.$transaction(async tx => {
      const original = await tx.voucher.findFirst({ where: withTenant(req, { id }), include: { lines: true } });
      if (!original) throw new Error('Voucher not found.'); if (original.status !== 'Posted') throw new Error('Only posted vouchers can be reversed.');
      if (original.sourceType && original.sourceId) {
        const newer = await tx.voucher.findFirst({ where: withTenant(req, { sourceType: original.sourceType, sourceId: original.sourceId, status: 'Posted', id: { gt: original.id } }), orderBy: { id: 'desc' } });
        if (newer) throw new Error(`Reverse the newer linked voucher ${newer.voucherNo} first.`);
      }
      const posting = { type: 'REVERSAL', totalAmount: original.totalAmount, sourceType: null, sourceId: null, metadata: { originalVoucherNo: original.voucherNo }, lines: original.lines.map(item => line(item.accountId, item.type === 'Dr' ? 'Cr' : 'Dr', item.amount, `Reversal of ${original.voucherNo}`)) };
      const reversal = await createVoucher(tx, req, { date: req.body.date || new Date().toISOString().slice(0, 10), narration: `Reversal of ${original.voucherNo}`, remarks: text(req.body.reason, 'Voucher reversed') }, posting, original.id);
      await restoreSource(tx, req, original); await tx.voucher.update({ where: { id: original.id }, data: { status: 'Reversed' } }); return reversal;
    });
    res.json(result);
  } catch (error) { console.error('Voucher reversal error:', error); res.status(400).json({ error: error.message || 'Failed to reverse voucher.' }); }
});

module.exports = router;
