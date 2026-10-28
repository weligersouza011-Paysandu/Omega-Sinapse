'use strict';

const { Router } = require('express');
const dashboardController = require('../controllers/dashboardController');

const router = Router();

// GET /api/dashboard?status=&categoria=&busca=
router.get('/', dashboardController.obterDashboard);

module.exports = router;
