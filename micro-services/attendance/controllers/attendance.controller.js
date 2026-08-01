const attendanceRepo = require('../repository/attendance.repo');
const pool = require('../config/db');

// Function to get attendance records
const getAttendanceData = (req, res) => {
    const date = req.body?.date || new Date().toISOString().split('T')[0]; // Default to today's date if not provided
    const query = attendanceRepo.getAttendanceData(date);
    pool.query(query, (error, results) => {
        if (error) {
            console.error('Error executing query:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        return res.json(results.rows);
    });
};

// Function to get attendance records for a specific employee
const getAttendanceDataByEmployee = (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();
    const date = req.body?.date || new Date().toISOString().split('T')[0]; // Default to today's date if not provided

    try {
        const queryConfig = attendanceRepo.getAttendanceDataByEmployee(employeeId, date);
        
        pool.query(queryConfig, (error, results) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            return res.json(results.rows);
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(400).json({ error: error.message });
    }
};

// Function to manage attendance for a specific employee
const manageAttendanceData = (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();

    try {
        const queryConfig = attendanceRepo.manageAttendanceData(employeeId);
        pool.query(queryConfig, (error, results) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: error.message });
            }
            return res.json(results.rows);
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(400).json({ error: error.message });
    }
};

module.exports = {
    getAttendanceData,
    getAttendanceDataByEmployee,
    manageAttendanceData,
};