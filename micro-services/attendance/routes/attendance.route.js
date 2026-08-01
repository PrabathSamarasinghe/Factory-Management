const attendanceController = require('../controllers/attendance.controller');
const express = require('express');
const router = express.Router();

// Route to get all attendance records
router.get('/', attendanceController.getAttendanceData);
router.get('/:employeeId', attendanceController.getAttendanceDataByEmployee);
router.post('/:employeeId', attendanceController.manageAttendanceData);

module.exports = router;