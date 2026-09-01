const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { isSuperAdmin } = require('../lib/security');
const { toRequiredInt } = require('../lib/coerce');

const router = express.Router();
const prisma = new PrismaClient();

const resources = {
  accounts: {
    model: 'account', label: 'Accounts', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, accountName: true, accountType: true, accountGroup: true },
    title: row => row.accountName,
  },
  billingLocations: {
    model: 'billingLocation', label: 'Billing Locations', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, locationName: true, companyId: true, gstNumber: true },
    title: row => row.locationName,
  },
  clientCompanies: {
    model: 'clientCompany', label: 'Client Companies', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, companyName: true, panNumber: true, status: true },
    title: row => row.companyName,
  },
  dieselEntries: {
    model: 'diesel', label: 'Diesel Entries', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, date: true, slipNumber: true, pumpName: true, quantityLiters: true, totalAmount: true },
    title: row => row.slipNumber || `Diesel entry #${row.id}`,
  },
  drivers: {
    model: 'driver', label: 'Drivers', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, name: true, licenseNo: true, phone: true, status: true },
    title: row => row.name,
  },
  driverSettlements: {
    model: 'driverSettlement', label: 'Driver Settlements', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, settlementNo: true, date: true, driverId: true, netPayable: true },
    title: row => row.settlementNo,
  },
  invoices: {
    model: 'invoice', label: 'Invoices', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, invoiceNo: true, date: true, grandTotal: true, status: true },
    title: row => row.invoiceNo,
  },
  invoicePayments: {
    model: 'invoicePayment', label: 'Invoice Payments', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, invoiceId: true, paymentDate: true, amount: true, referenceNo: true },
    title: row => row.referenceNo || `Invoice payment #${row.id}`,
  },
  ledgerEntries: {
    model: 'ledgerEntry', label: 'Ledger Entries', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, date: true, accountId: true, type: true, amount: true, narration: true },
    title: row => row.narration || `Ledger entry #${row.id}`,
  },
  loans: {
    model: 'loan', label: 'Loans', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, loanNo: true, lenderName: true, outstandingAmount: true, status: true },
    title: row => row.loanNo || row.lenderName,
  },
  companyProfiles: {
    model: 'myCompanyProfile', label: 'Company Profiles', tenantScoped: false, superAdminOnly: true,
    select: { id: true, tenantKey: true, deletedAt: true, companyName: true, gstNumber: true, panNumber: true },
    title: row => row.companyName,
  },
  routes: {
    model: 'routeMaster', label: 'Routes', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, fromLocation: true, toLocation: true, defaultRate: true },
    title: row => `${row.fromLocation} to ${row.toLocation}`,
  },
  trips: {
    model: 'trip', label: 'Trips', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, tripNo: true, date: true, status: true, totalClientBill: true },
    title: row => row.tripNo,
  },
  users: {
    model: 'user', label: 'Users', tenantScoped: false, superAdminOnly: true,
    select: { id: true, deletedAt: true, name: true, email: true, role: true, status: true },
    title: row => row.name || row.email,
  },
  userCompanyAccess: {
    model: 'userCompanyAccess', label: 'User Company Access', tenantScoped: false, superAdminOnly: true,
    select: { id: true, deletedAt: true, userId: true, tenantKey: true, createdAt: true },
    title: row => `User #${row.userId} - ${row.tenantKey}`,
  },
  vehicles: {
    model: 'vehicle', label: 'Vehicles', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, regNo: true, ownerName: true, type: true, status: true },
    title: row => row.regNo,
  },
  vendorSettlements: {
    model: 'vendorSettlement', label: 'Vendor Settlements', tenantScoped: true,
    select: { id: true, tenantKey: true, deletedAt: true, settlementNo: true, date: true, netPayable: true, status: true },
    title: row => row.settlementNo,
  },
};

function resourceFor(type, req) {
  const resource = resources[type];
  if (!resource || (resource.superAdminOnly && !isSuperAdmin(req.user))) {
    const error = new Error('Unsupported recycle-bin record type.');
    error.status = 404;
    throw error;
  }
  return resource;
}

function deletedWhere(resource, req, id) {
  const where = { deletedAt: { not: null } };
  if (id != null) where.id = id;
  if (resource.tenantScoped) where.tenantKey = req.tenantKey;
  return where;
}

router.get('/types', (req, res) => {
  res.json(Object.entries(resources)
    .filter(([, value]) => !value.superAdminOnly || isSuperAdmin(req.user))
    .map(([key, value]) => ({ key, label: value.label })));
});

router.get('/', async (req, res) => {
  try {
    const requestedType = String(req.query.type || 'all');
    const entries = requestedType === 'all'
      ? Object.entries(resources).filter(([, value]) => !value.superAdminOnly || isSuperAdmin(req.user))
      : [[requestedType, resourceFor(requestedType, req)]];
    const groups = await Promise.all(entries.map(async ([type, resource]) => {
      const rows = await prisma[resource.model].findMany({
        where: deletedWhere(resource, req),
        select: resource.select,
        orderBy: { deletedAt: 'desc' },
        take: 200,
      });
      return rows.map(row => ({ type, typeLabel: resource.label, title: resource.title(row), ...row }));
    }));
    res.json(groups.flat().sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)));
  } catch (error) {
    console.error('Recycle bin fetch failed:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to load recycle bin.' });
  }
});

async function restoreRecord(tx, type, resource, record) {
  const id = record.id;
  if (type === 'users') {
    return tx.user.update({ where: { id }, data: { deletedAt: null, status: 'Active' } });
  }
  if (type === 'companyProfiles') {
    await tx.userCompanyAccess.updateMany({ where: { tenantKey: record.tenantKey, deletedAt: { not: null } }, data: { deletedAt: null } });
  }
  if (type === 'drivers') {
    await tx.account.updateMany({ where: { tenantKey: record.tenantKey, driverId: id, deletedAt: { not: null } }, data: { deletedAt: null } });
  }
  if (type === 'trips') {
    await tx.ledgerEntry.updateMany({ where: { tenantKey: record.tenantKey, tripId: id, deletedAt: { not: null } }, data: { deletedAt: null } });
  }
  if (type === 'dieselEntries') {
    await tx.ledgerEntry.updateMany({ where: { tenantKey: record.tenantKey, dieselId: id, deletedAt: { not: null } }, data: { deletedAt: null } });
  }
  if (type === 'invoices') {
    await tx.invoicePayment.updateMany({ where: { tenantKey: record.tenantKey, invoiceId: id, deletedAt: { not: null } }, data: { deletedAt: null } });
    await tx.ledgerEntry.updateMany({ where: { tenantKey: record.tenantKey, invoiceId: id, deletedAt: { not: null } }, data: { deletedAt: null } });
  }
  if (type === 'vendorSettlements') {
    await tx.ledgerEntry.updateMany({ where: { tenantKey: record.tenantKey, settlementId: id, deletedAt: { not: null } }, data: { deletedAt: null } });
  }
  return tx[resource.model].update({ where: { id }, data: { deletedAt: null } });
}

router.patch('/:type/:id/restore', async (req, res) => {
  try {
    const type = req.params.type;
    const resource = resourceFor(type, req);
    const id = toRequiredInt(req.params.id, 'Recycle-bin record');
    const record = await prisma[resource.model].findFirst({ where: deletedWhere(resource, req, id), select: resource.select });
    if (!record) return res.status(404).json({ error: 'Deleted record not found.' });
    await prisma.$transaction(tx => restoreRecord(tx, type, resource, record));
    res.json({ message: `${resource.label} record restored.` });
  } catch (error) {
    console.error('Recycle bin restore failed:', error);
    const conflict = error.code === 'P2002' ? 'A conflicting active record already exists.' : null;
    res.status(error.status || 400).json({ error: conflict || error.message || 'Failed to restore record.' });
  }
});

async function permanentlyDeleteRecord(tx, type, resource, record, currentUserId) {
  const id = record.id;
  if (type === 'users') {
    if (id === currentUserId) throw new Error('You cannot permanently delete your own account.');
    await tx.userCompanyAccess.deleteMany({ where: { userId: id } });
  }
  if (type === 'companyProfiles') {
    await tx.userCompanyAccess.deleteMany({ where: { tenantKey: record.tenantKey, deletedAt: { not: null } } });
  }
  if (type === 'invoices') {
    await tx.ledgerEntry.deleteMany({ where: { tenantKey: record.tenantKey, invoiceId: id, deletedAt: { not: null } } });
    await tx.invoicePayment.deleteMany({ where: { tenantKey: record.tenantKey, invoiceId: id, deletedAt: { not: null } } });
  }
  return tx[resource.model].delete({ where: { id } });
}

router.delete('/:type/:id/permanent', async (req, res) => {
  try {
    const type = req.params.type;
    const resource = resourceFor(type, req);
    const id = toRequiredInt(req.params.id, 'Recycle-bin record');
    const record = await prisma[resource.model].findFirst({ where: deletedWhere(resource, req, id), select: resource.select });
    if (!record) return res.status(404).json({ error: 'Deleted record not found.' });
    await prisma.$transaction(tx => permanentlyDeleteRecord(tx, type, resource, record, req.user.id));
    res.json({ message: `${resource.label} record permanently deleted.` });
  } catch (error) {
    console.error('Recycle bin permanent delete failed:', error);
    const linked = error.code === 'P2003'
      ? 'This record is still referenced by other data. Delete or reassign the linked records first.'
      : null;
    res.status(error.status || 400).json({ error: linked || error.message || 'Failed to permanently delete record.' });
  }
});

module.exports = router;
