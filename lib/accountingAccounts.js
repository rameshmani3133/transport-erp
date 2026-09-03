const { withTenant } = require('../routes/tenant');

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function clientLedgerName(companyName) {
  return cleanName(companyName);
}

function driverAdvanceLedgerName(driverName) {
  return `${cleanName(driverName)} - Driver Advance`;
}

function vendorLedgerName(ownerName, regNo) {
  const baseName = cleanName(ownerName) || cleanName(regNo);
  return baseName ? `${baseName} - Vendor` : '';
}

async function upsertLinkedOrNamedAccount(tx, req, { linkedWhere, accountName, data }) {
  if (!accountName) return null;

  if (linkedWhere) {
    const linkedAccount = await tx.account.findFirst({ where: withTenant(req, linkedWhere) });
    if (linkedAccount) {
      return tx.account.update({ where: { id: linkedAccount.id }, data: { ...data, accountName } });
    }
  }

  const reusableAccount = await tx.account.findFirst({ where: withTenant(req, { accountName }) });
  if (reusableAccount) {
    return tx.account.update({ where: { id: reusableAccount.id }, data });
  }

  return tx.account.create({
    data: {
      tenantKey: req.tenantKey,
      accountName,
      openingBalance: 0,
      ...data
    }
  });
}

async function ensureNamedAccount(tx, req, accountName, data) {
  return upsertLinkedOrNamedAccount(tx, req, { accountName, data });
}

async function ensureClientLedgerAccount(tx, req, company) {
  return upsertLinkedOrNamedAccount(tx, req, {
    linkedWhere: { clientId: company.id },
    accountName: clientLedgerName(company.companyName),
    data: {
      accountType: 'Asset',
      accountGroup: 'Sundry Debtors (Clients)',
      balanceType: 'Dr',
      clientId: company.id
    }
  });
}

async function ensureClientLedgerAccounts(tx, req) {
  const companies = await tx.clientCompany.findMany({ where: withTenant(req) });
  for (const company of companies) {
    await ensureClientLedgerAccount(tx, req, company);
  }
}

async function ensureDriverAdvanceAccount(tx, req, driver) {
  return upsertLinkedOrNamedAccount(tx, req, {
    linkedWhere: { driverId: driver.id },
    accountName: driverAdvanceLedgerName(driver.name),
    data: {
      accountType: 'Asset',
      accountGroup: 'Loans & Advances (Asset)',
      balanceType: 'Dr',
      driverId: driver.id
    }
  });
}

async function ensureDriverPayableAccount(tx, req, driver) {
  return ensureNamedAccount(tx, req, `${cleanName(driver.name)} - Driver Payable`, {
    accountType: 'Liability',
    accountGroup: 'Driver/Payroll Payable',
    balanceType: 'Cr'
  });
}

async function ensureMarketVendorAccount(tx, req, vehicle) {
  if (vehicle.ownershipType !== 'Market') return null;
  if (vehicle.vendorAccountId) {
    const selectedAccount = await tx.account.findFirst({ where: withTenant(req, { id: vehicle.vendorAccountId }) });
    if (selectedAccount) return selectedAccount;
  }

  return upsertLinkedOrNamedAccount(tx, req, {
    accountName: vendorLedgerName(vehicle.ownerName, vehicle.regNo),
    data: {
      accountType: 'Liability',
      accountGroup: 'Sundry Creditors (Vendors)',
      balanceType: 'Cr'
    }
  });
}

async function ensureDieselControlAccounts(tx, req) {
  const clientDieselControl = await ensureNamedAccount(tx, req, 'Client Diesel Control', {
    accountType: 'Liability',
    accountGroup: 'Client Diesel Advances',
    balanceType: 'Cr'
  });
  const vendorDieselControl = await ensureNamedAccount(tx, req, 'Vendor Diesel Control', {
    accountType: 'Asset',
    accountGroup: 'Vendor Diesel Recoverable',
    balanceType: 'Dr'
  });
  return { clientDieselControl, vendorDieselControl };
}

async function ensureClientDieselAccount(tx, req, company) {
  const { clientDieselControl } = await ensureDieselControlAccounts(tx, req);
  return ensureNamedAccount(tx, req, `${cleanName(company.companyName)} - Client Diesel`, {
    accountType: 'Liability',
    accountGroup: 'Client Diesel Advances',
    balanceType: 'Cr',
    parentAccountId: clientDieselControl.id
  });
}

async function ensureVendorDieselAccount(tx, req, vendorAccount) {
  const { vendorDieselControl } = await ensureDieselControlAccounts(tx, req);
  return ensureNamedAccount(tx, req, `${cleanName(vendorAccount.accountName).replace(/ - Vendor$/, '')} - Vendor Diesel`, {
    accountType: 'Asset',
    accountGroup: 'Vendor Diesel Recoverable',
    balanceType: 'Dr',
    parentAccountId: vendorDieselControl.id
  });
}

async function ensureStandardAccountingAccounts(tx, req) {
  const definitions = [
    ['Freight Sales', { accountType: 'Income', accountGroup: 'Direct Income (Freight)', balanceType: 'Cr' }],
    ['Halting Charges Income', { accountType: 'Income', accountGroup: 'Direct Income (Freight)', balanceType: 'Cr' }],
    ['ODC Charges Income', { accountType: 'Income', accountGroup: 'Direct Income (Freight)', balanceType: 'Cr' }],
    ['Other Charges Income', { accountType: 'Income', accountGroup: 'Direct Income (Freight)', balanceType: 'Cr' }],
    ['Vendor Commission Income', { accountType: 'Income', accountGroup: 'Indirect Income', balanceType: 'Cr' }],
    ['Vendor Deduction Income', { accountType: 'Income', accountGroup: 'Indirect Income', balanceType: 'Cr' }],
    ['Output CGST', { accountType: 'Liability', accountGroup: 'Duties & Taxes', balanceType: 'Cr' }],
    ['Output SGST', { accountType: 'Liability', accountGroup: 'Duties & Taxes', balanceType: 'Cr' }],
    ['Output IGST', { accountType: 'Liability', accountGroup: 'Duties & Taxes', balanceType: 'Cr' }],
    ['Diesel Expense', { accountType: 'Expense', accountGroup: 'Direct Expense (Diesel/Tolls)', balanceType: 'Dr' }],
    ['Vendor Freight Expense', { accountType: 'Expense', accountGroup: 'Vendor Freight Expense', balanceType: 'Dr' }],
    ['Driver Salary & Trip Expense', { accountType: 'Expense', accountGroup: 'Driver/Payroll Expense', balanceType: 'Dr' }],
    ['Driver Payable', { accountType: 'Liability', accountGroup: 'Driver/Payroll Payable', balanceType: 'Cr' }],
    ['Interest on Loans', { accountType: 'Expense', accountGroup: 'Finance Costs', balanceType: 'Dr' }],
    ['Loan Processing & Penalty Charges', { accountType: 'Expense', accountGroup: 'Finance Costs', balanceType: 'Dr' }],
    ['Office Rent Expense', { accountType: 'Expense', accountGroup: 'Indirect Expense (Office/Admin)', balanceType: 'Dr' }],
    ['Electricity Expense', { accountType: 'Expense', accountGroup: 'Indirect Expense (Office/Admin)', balanceType: 'Dr' }],
    ['Utilities Expense', { accountType: 'Expense', accountGroup: 'Indirect Expense (Office/Admin)', balanceType: 'Dr' }],
    ['Internet & Telephone Expense', { accountType: 'Expense', accountGroup: 'Indirect Expense (Office/Admin)', balanceType: 'Dr' }],
    ['Insurance Expense', { accountType: 'Expense', accountGroup: 'Indirect Expense (Office/Admin)', balanceType: 'Dr' }],
    ['Repairs & Maintenance Expense', { accountType: 'Expense', accountGroup: 'Indirect Expense (Office/Admin)', balanceType: 'Dr' }],
    ['Subscription Expense', { accountType: 'Expense', accountGroup: 'Indirect Expense (Office/Admin)', balanceType: 'Dr' }],
    ['Tax & License Expense', { accountType: 'Expense', accountGroup: 'Indirect Expense (Office/Admin)', balanceType: 'Dr' }],
    ['Other Administrative Expense', { accountType: 'Expense', accountGroup: 'Indirect Expense (Office/Admin)', balanceType: 'Dr' }],
    ['Bills Payable', { accountType: 'Liability', accountGroup: 'Other Current Liabilities', balanceType: 'Cr' }],
    ['Input CGST', { accountType: 'Asset', accountGroup: 'Duties & Taxes (Input Credit)', balanceType: 'Dr' }],
    ['Input SGST', { accountType: 'Asset', accountGroup: 'Duties & Taxes (Input Credit)', balanceType: 'Dr' }],
    ['Input IGST', { accountType: 'Asset', accountGroup: 'Duties & Taxes (Input Credit)', balanceType: 'Dr' }],
    ['TDS Payable', { accountType: 'Liability', accountGroup: 'Duties & Taxes', balanceType: 'Cr' }],
    ['Capital Account', { accountType: 'Equity', accountGroup: 'Capital & Reserves', balanceType: 'Cr' }],
    ['Owner Drawings', { accountType: 'Equity', accountGroup: 'Capital & Reserves', balanceType: 'Dr' }],
    ['Client Diesel Control', { accountType: 'Liability', accountGroup: 'Client Diesel Advances', balanceType: 'Cr' }],
    ['Vendor Diesel Control', { accountType: 'Asset', accountGroup: 'Vendor Diesel Recoverable', balanceType: 'Dr' }]
  ];

  const result = {};
  for (const [accountName, data] of definitions) {
    result[accountName] = await ensureNamedAccount(tx, req, accountName, data);
  }
  return result;
}

module.exports = {
  ensureNamedAccount,
  ensureClientLedgerAccount,
  ensureClientLedgerAccounts,
  ensureDriverAdvanceAccount,
  ensureDriverPayableAccount,
  ensureMarketVendorAccount,
  ensureClientDieselAccount,
  ensureVendorDieselAccount,
  ensureStandardAccountingAccounts
};
