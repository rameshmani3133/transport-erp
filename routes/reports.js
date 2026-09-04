const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

function balanceFor(account) {
    return (account.openingBalance || 0) + account.entries.reduce((sum, e) => {
        if (account.balanceType === 'Dr') return sum + (e.type === 'Dr' ? e.amount : -e.amount);
        return sum + (e.type === 'Cr' ? e.amount : -e.amount);
    }, 0);
}

const number = value => Number(value || 0);
const round = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;

function detailedTripRow(trip) {
    const clientOdc = number(trip.clientExtraSizeCharge);
    const vendorOdc = number(trip.vendorExtraSizeCharge);
    const clientHalting = number(trip.haltingCharge);
    const vendorHalting = number(trip.vendorHaltingCharge);
    const clientGross = round(trip.totalClientBill);
    const vendorGross = round(trip.netTruckPayout);
    const clientFreight = round(number(trip.clientFreight) || (clientGross - clientOdc - clientHalting));
    const vendorFreight = round(number(trip.vendorFreight) || (vendorGross - vendorOdc - vendorHalting));
    const trackedDiesel = round((trip.diesels || []).reduce((sum, diesel) => sum + number(diesel.totalAmount), 0));
    const clientPaidDiesel = round(trip.dieselAmount);
    const vendorDieselRecovery = trip.vehicle?.ownershipType === 'Market' ? clientPaidDiesel : 0;
    const tripExpenses = round(number(trip.rtoPc) + number(trip.parking) + number(trip.loading) + number(trip.unloading) + number(trip.otherBillsAmount));
    const commission = round(trip.commission);
    const otherDeduction = round(trip.otherDeduction);
    const vendorAdvance = round(trip.advancePaid);
    const clientAdvance = round(trip.clientAdvanceAmount);
    const vendorDeductions = round(vendorAdvance + vendorDieselRecovery + commission + otherDeduction);
    const clientDeductions = round(clientAdvance + clientPaidDiesel);
    const ownDeductions = round(trackedDiesel + tripExpenses);
    const measurement = [trip.length, trip.width, trip.height].some(value => number(value) > 0)
        ? [trip.length, trip.width, trip.height].map(value => number(value) || '-').join(' x ')
        : '-';
    const vendorName = trip.vehicle?.vendorAccount?.accountName || trip.vehicle?.ownerName || '-';

    return {
        id: trip.id,
        tripNo: trip.tripNo,
        movementNo: trip.docNumber || trip.tripNo,
        date: trip.date,
        vehicleId: trip.vehicleId,
        vehicleNo: trip.vehicle?.regNo || '-',
        ownershipType: trip.vehicle?.ownershipType || '-',
        clientId: trip.companyId,
        clientName: trip.company?.companyName || '-',
        vendorName,
        driverName: trip.driver?.name || '-',
        fromLocation: trip.route?.fromLocation || '-',
        toLocation: trip.route?.toLocation || '-',
        measurement,
        billWeight: round(trip.billWeight),
        guaranteeWeight: round(trip.guaranteeWeight),
        chargeableWeight: round(Math.max(number(trip.billWeight), number(trip.guaranteeWeight))),
        haltingDays: round(trip.haltingDays),
        invoiceNo: trip.invoice?.invoiceNo || '',
        invoiceStatus: trip.invoice?.status || (trip.invoiceId ? 'Linked' : 'Unbilled'),
        settlementNo: trip.settlement?.settlementNo || '',
        settlementStatus: trip.settlement?.status || (trip.settlementId ? 'Linked' : 'Unsettled'),
        tripStatus: trip.status,
        remarks: trip.remarks || '',
        expenseRemarks: trip.otherBillsDesc || '',
        views: {
            client: {
                partyName: trip.company?.companyName || '-', rateType: trip.clientCalcType, rate: round(trip.clientRate), basicFreight: clientFreight,
                odcAmount: round(clientOdc), haltingAmount: round(clientHalting), grossAmount: clientGross,
                advance: clientAdvance, advanceDate: trip.clientAdvanceDate, dieselRecovery: clientPaidDiesel, commission: 0,
                otherExpenses: 0, otherDeduction: 0, totalDeductions: clientDeductions, balanceAmount: round(clientGross - clientDeductions)
            },
            vendor: {
                partyName: vendorName, rateType: trip.vendorCalcType, rate: round(trip.vendorRate), basicFreight: vendorFreight,
                odcAmount: round(vendorOdc), haltingAmount: round(vendorHalting), grossAmount: vendorGross,
                advance: vendorAdvance, advanceDate: trip.advanceDate, dieselRecovery: vendorDieselRecovery, commission,
                otherExpenses: 0, otherDeduction, totalDeductions: vendorDeductions, balanceAmount: round(vendorGross - vendorDeductions)
            },
            own: {
                partyName: trip.driver?.name || trip.vehicle?.ownerName || '-', rateType: trip.clientCalcType, rate: round(trip.clientRate), basicFreight: clientFreight,
                odcAmount: round(clientOdc), haltingAmount: round(clientHalting), grossAmount: clientGross,
                advance: vendorAdvance, advanceDate: trip.advanceDate, dieselRecovery: trackedDiesel, commission: 0,
                otherExpenses: tripExpenses, otherDeduction: 0, totalDeductions: ownDeductions, balanceAmount: round(clientGross - ownDeductions)
            }
        }
    };
}

router.get('/trips', async (req, res) => {
    try {
        const trips = await prisma.trip.findMany({
            where: withTenant(req),
            include: {
                company: true,
                route: true,
                vehicle: { include: { vendorAccount: true } },
                driver: true,
                invoice: { select: { invoiceNo: true, status: true } },
                settlement: { select: { settlementNo: true, status: true } },
                diesels: { where: { deletedAt: null }, select: { totalAmount: true } }
            },
            orderBy: [{ date: 'asc' }, { id: 'asc' }]
        });
        const rows = trips.map(detailedTripRow);
        res.json({ rows, generatedAt: new Date().toISOString() });
    } catch (error) {
        console.error('Detailed trip report error:', error);
        res.status(500).json({ error: 'Failed to generate detailed trip report.' });
    }
});

router.get('/summary', async (req, res) => {
    try {
        const [accounts, trips, invoices] = await Promise.all([
            prisma.account.findMany({ where: withTenant(req), include: { entries: { where: { deletedAt: null } } } }),
            prisma.trip.findMany({ where: withTenant(req) }),
            prisma.invoice.findMany({ where: withTenant(req) })
        ]);

        const enriched = accounts.map(account => ({ ...account, currentBalance: balanceFor(account) }));
        const revenue = enriched.filter(a => a.accountType === 'Income').reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);
        const expenses = enriched.filter(a => a.accountType === 'Expense').reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);
        const receivables = enriched.filter(a => a.accountGroup?.includes('Sundry Debtors')).reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);
        const payables = enriched.filter(a => a.accountGroup?.includes('Sundry Creditors')).reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);
        const taxPayable = enriched.filter(a => a.accountGroup === 'Duties & Taxes').reduce((sum, a) => sum + Math.max(0, a.currentBalance), 0);

        res.json({
            receivables,
            payables,
            taxPayable,
            totalRevenue: revenue,
            totalExpense: expenses,
            grossMargin: revenue - expenses,
            tripsCount: trips.length,
            invoicesCount: invoices.length
        });
    } catch (error) {
        console.error("Reports Error:", error);
        res.status(500).json({ error: "Failed to generate reports." });
    }
});

module.exports = router;
module.exports.detailedTripRow = detailedTripRow;
