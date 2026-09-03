const express = require('express');
const cors = require('cors');
const path = require('path'); // <-- ADDED: Required for serving frontend files
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, tenantMiddleware } = require('./routes/tenant');
const { router: authRouter, ensureSuperAdmin } = require('./routes/auth');
const { auditMiddleware } = require('./lib/audit');
const { scheduleDailyBackup } = require('./lib/backup');
const { scheduleDailyReminderEmails } = require('./lib/reminderService');
const { ensureDatabaseSchema } = require('./lib/schemaSync');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : true;
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api', authMiddleware);
app.use('/api', tenantMiddleware);
app.use('/api', auditMiddleware(prisma));

// ==========================================
// IMPORT ROUTE MODULES
// ==========================================
const tripsRouter = require('./routes/trips');
const ledgerRouter = require('./routes/ledger');
const invoicesRouter = require('./routes/invoices');
const locationsRouter = require('./routes/locations');
const companiesRouter = require('./routes/companies');
const vehiclesRouter = require('./routes/vehicles');
const driversRouter = require('./routes/drivers');
const routesMasterRouter = require('./routes/routesMaster');
const dieselRouter = require('./routes/diesel');
const settlementsRouter = require('./routes/settlements');
const reportsRouter = require('./routes/reports');
const myCompanyRouter = require('./routes/myCompany');
const adminRouter = require('./routes/admin'); 
const paymentsRouter = require('./routes/payments');
const loansRouter = require('./routes/loans');
const remindersRouter = require('./routes/reminders');
const recurringBillsRouter = require('./routes/recurringBills');
const vouchersRouter = require('./routes/vouchers');
const recycleBinRouter = require('./routes/recycleBin');

// ==========================================
// MOUNT API ROUTES
// ==========================================
app.use('/api/trips', tripsRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/drivers', driversRouter);
app.use('/api/routes-master', routesMasterRouter);
app.use('/api/diesel', dieselRouter);
app.use('/api/settlements', settlementsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/my-company', myCompanyRouter);
app.use('/api/admin', adminRouter); 
app.use('/api/payments', paymentsRouter);
app.use('/api/loans', loansRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/recurring-bills', recurringBillsRouter);
app.use('/api/vouchers', vouchersRouter);
app.use('/api/recycle-bin', recycleBinRouter);
app.use('/api/driver-settlements', require('./routes/driverSettlements'));


// ==========================================
// PRODUCTION FRONTEND SERVING
// ==========================================
// 1. Serve static files from the compiled React frontend app
app.use(express.static(path.join(__dirname, 'client/dist')));

// 2. Catch-all route: Send any unknown requests back to React's index.html
// This allows React Router to handle page navigation without throwing 404 errors.
// THIS MUST BE THE VERY LAST ROUTE IN THE FILE.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

// Start Server
async function start() {
    await ensureDatabaseSchema(prisma);
    await ensureSuperAdmin();
    scheduleDailyBackup(prisma);
    scheduleDailyReminderEmails(prisma);
    app.listen(PORT, () => {
        console.log(`ERP Server is running and listening on port ${PORT}`);
    });
}

start().catch((error) => {
    console.error('Startup failed:', error);
    process.exit(1);
});
