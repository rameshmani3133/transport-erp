const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
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
                companyId: parseInt(req.body.companyId),
                tenantKey: req.tenantKey,
                fromLocation: req.body.fromLocation,
                toLocation: req.body.toLocation,
                rtkm: parseFloat(req.body.rtkm || 0),
                calcType: req.body.calcType || 'PerTon',
                defaultRate: parseFloat(req.body.defaultRate || 0)
            }
        });
        res.json(route);
    } catch (error) {
        res.status(400).json({ error: "Failed to create route." });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const route = await prisma.routeMaster.update({
            where: withTenant(req, { id: parseInt(req.params.id) }),
            data: {
                companyId: parseInt(req.body.companyId),
                fromLocation: req.body.fromLocation,
                toLocation: req.body.toLocation,
                rtkm: parseFloat(req.body.rtkm || 0),
                calcType: req.body.calcType || 'PerTon',
                defaultRate: parseFloat(req.body.defaultRate || 0)
            }
        });
        res.json(route);
    } catch (error) {
        res.status(400).json({ error: "Failed to update route." });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.routeMaster.deleteMany({ where: withTenant(req, { id: parseInt(req.params.id) }) });
        res.json({ message: "Route deleted." });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete route." });
    }
});

module.exports = router;
