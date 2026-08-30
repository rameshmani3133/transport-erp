const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { withTenant } = require('./tenant');
const router = express.Router();
const prisma = new PrismaClient();

// GET ALL CLIENT COMPANIES
router.get('/', async (req, res) => {
    try {
        const companies = await prisma.clientCompany.findMany({
            where: withTenant(req),
            orderBy: { id: 'desc' }
        });
        res.json(companies);
    } catch (error) {
        console.error("Client Company Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch client companies." });
    }
});

// CREATE NEW CLIENT COMPANY
router.post('/', async (req, res) => {
    try {
        const newCompany = await prisma.clientCompany.create({
            data: {
                companyName: req.body.companyName,
                tenantKey: req.tenantKey,
                panNumber: req.body.panNumber || null,
                status: req.body.status || 'Active'
            }
        });
        res.json(newCompany);
    } catch (error) {
        console.error("Client Company Create Error:", error);
        if (error.code === 'P2002') return res.status(400).json({ error: "Company name already exists." });
        res.status(400).json({ error: error.message || "Failed to create company." });
    }
});

// UPDATE CLIENT COMPANY
router.put('/:id', async (req, res) => {
    try {
        const updatedCompany = await prisma.clientCompany.update({
            where: withTenant(req, { id: parseInt(req.params.id) }),
            data: {
                companyName: req.body.companyName,
                panNumber: req.body.panNumber || null,
                status: req.body.status || 'Active'
            }
        });
        res.json(updatedCompany);
    } catch (error) {
        console.error("Client Company Update Error:", error);
        res.status(400).json({ error: error.message || "Failed to update company." });
    }
});

// DELETE CLIENT COMPANY
router.delete('/:id', async (req, res) => {
    try {
        await prisma.clientCompany.updateMany({ where: withTenant(req, { id: parseInt(req.params.id) }), data: { deletedAt: new Date() } });
        res.json({ message: "Company deleted successfully." });
    } catch (error) {
        console.error("Client Company Delete Error:", error);
        res.status(400).json({ error: "Failed to delete company. It may be linked to a route or location." });
    }
});

module.exports = router;

