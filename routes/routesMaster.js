const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const { toNumber, toRequiredInt, text } = require('../lib/coerce');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
    try {
        const routes = await prisma.routeMaster.findMany({
            where: withTenant(req),
            include: { company: true },
            orderBy: { id: 'desc' }
        });
        res.json(routes);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch routes." });
    }
});

router.post('/', async (req, res) => {
    try {
        const route = await prisma.routeMaster.create({
            data: {
                companyId: toRequiredInt(req.body.companyId, 'Client company'),
                tenantKey: req.tenantKey,
                fromLocation: text(req.body.fromLocation),
                toLocation: text(req.body.toLocation),
                rtkm: toNumber(req.body.rtkm),
                calcType: req.body.calcType || 'PerTon',
                defaultRate: toNumber(req.body.defaultRate)
            }
        });
        res.json(route);
    } catch (error) {
        res.status(400).json({ error: error.message || "Failed to create route." });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const route = await prisma.routeMaster.update({
            where: withTenant(req, { id: toRequiredInt(req.params.id, 'Route') }),
            data: {
                companyId: toRequiredInt(req.body.companyId, 'Client company'),
                fromLocation: text(req.body.fromLocation),
                toLocation: text(req.body.toLocation),
                rtkm: toNumber(req.body.rtkm),
                calcType: req.body.calcType || 'PerTon',
                defaultRate: toNumber(req.body.defaultRate)
            }
        });
        res.json(route);
    } catch (error) {
        res.status(400).json({ error: error.message || "Failed to update route." });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.routeMaster.updateMany({ where: withTenant(req, { id: toRequiredInt(req.params.id, 'Route') }), data: { deletedAt: new Date() } });
        res.json({ message: "Route deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete route." });
    }
});

module.exports = router;
