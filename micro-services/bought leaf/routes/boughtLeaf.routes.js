const express = require('express');

const router = express.Router();

// Import the authenticateToken middleware
const { authenticateToken } = require('../middleware/auth');
const boughtLeafController = require('../controllers/boughtLeaf.controller');

// Example route for getting bought leaf data
router.get('/', authenticateToken, boughtLeafController.getBoughtLeafData);
router.get('/:supplierId', authenticateToken, boughtLeafController.getBoughtLeafDataBySupplier);
router.post('/', authenticateToken, boughtLeafController.insertBoughtLeafData);

module.exports = router;    