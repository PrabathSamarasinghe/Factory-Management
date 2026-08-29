const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const usersController = require('../controllers/users.controllers');

// GET: Retrieve categorized types for dropdowns (driver, helper, lorry, route)
router.get('/all/types', authenticateToken, usersController.getUsersByType);

// GET: Retrieve all users of a specific type (employee or supplier)
router.get('/:user_type', authenticateToken, usersController.getAllUsers);

// POST: Create a new supplier
router.post('/supplier', authenticateToken, usersController.createSupplier);

// POST: Create a new employee
router.post('/employee', authenticateToken, usersController.createEmployee);

// GET: Retrieve user details by ID
router.get('/employee/:employee_id', authenticateToken, usersController.getEmployeeById);
router.get('/supplier/:supplier_id', authenticateToken, usersController.getSupplierById);
router.get('/bank/:user_id', authenticateToken, usersController.getBankDetailsByUserId);
router.post('/bank', authenticateToken, usersController.createBankDetails);

// PATCH: Update user details by ID
router.patch('/supplier/:supplier_id', authenticateToken, usersController.updateSupplier);
router.patch('/employee/:employee_id', authenticateToken, usersController.updateEmployee);

module.exports = router;