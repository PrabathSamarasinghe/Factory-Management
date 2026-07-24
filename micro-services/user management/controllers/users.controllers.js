const usersRepo = require('../repository/users.repo');

const pool = require('../config/db');

const validateSupplierPayload = (payload = {}) => {
  const { name, nic_number, birthday, photo_url, nic_url, custom_id, route_id } = payload;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return 'name is required and must be a non-empty string';
  }

  if (!nic_number || typeof nic_number !== 'string' || nic_number.trim().length === 0) {
    return 'nic_number is required and must be a non-empty string';
  }

  if (!birthday || isNaN(new Date(birthday).getTime())) {
    return 'birthday is required and must be a valid date';
  }

  if (!photo_url || typeof photo_url !== 'string') {
    return 'photo_url is required and must be a string';
  }

  if (!nic_url || typeof nic_url !== 'string') {
    return 'nic_url is required and must be a string';
  }

  if (!custom_id || typeof custom_id !== 'string' || custom_id.trim().length === 0) {
    return 'custom_id is required and must be a non-empty string';
  }

  if (!Number.isInteger(Number(route_id)) || Number(route_id) <= 0) {
    return 'route_id is required and must be a positive integer';
  }

  return null;
};

const validateEmployeePayload = (payload = {}) => {
  const { name, nic_number, birthday, photo_url, nic_url, job, job_title } = payload;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return 'name is required and must be a non-empty string';
  }

  if (!nic_number || typeof nic_number !== 'string' || nic_number.trim().length === 0) {
    return 'nic_number is required and must be a non-empty string';
  }

  if (!birthday || isNaN(new Date(birthday).getTime())) {
    return 'birthday is required and must be a valid date';
  }

  if (!photo_url || typeof photo_url !== 'string') {
    return 'photo_url is required and must be a string';
  }

  if (!nic_url || typeof nic_url !== 'string') {
    return 'nic_url is required and must be a string';
  }

  if (!job || typeof job !== 'string' || job.trim().length === 0) {
    return 'job is required and must be a non-empty string';
  }

  if (!job_title || typeof job_title !== 'string' || job_title.trim().length === 0) {
    return 'job_title is required and must be a non-empty string';
  }

  return null;
};

const getAllUsers = async (req, res) => {
  const user_type = String(req.params.user_type || '').trim();

  if (!user_type) {
    return res.status(400).json({ error: 'user_type parameter is required' });
  }

  try {
    const queryConfig = usersRepo.getAllUsers(user_type);
    pool.query(queryConfig, (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      return res.json(results.rows);
    });
  } catch (validationError) {
    return res.status(400).json({ error: validationError.message });
  }
};

const createSupplier = async (req, res) => {
  const validationError = validateSupplierPayload(req.body);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const queryConfig = usersRepo.createSupplier(req.body);
    pool.query(queryConfig, (error) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      return res.status(201).json({ message: 'Supplier created successfully' });
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createEmployee = async (req, res) => {
  const validationError = validateEmployeePayload(req.body);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const queryConfig = usersRepo.createEmployee(req.body);
    pool.query(queryConfig, (error) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      return res.status(201).json({ message: 'Employee created successfully' });
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getEmployeeById = async (req, res) => {
  const employee_id = parseInt(req.params.employee_id, 10);

  if (isNaN(employee_id) || employee_id <= 0) {
    return res.status(400).json({ error: 'Invalid employee_id parameter' });
  }

  try {
    const queryConfig = usersRepo.getEmployeeById(employee_id);
    pool.query(queryConfig, (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      if (results.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      return res.json(results.rows[0]);
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getSupplierById = async (req, res) => {
  const supplier_id = parseInt(req.params.supplier_id, 10);

  if (isNaN(supplier_id) || supplier_id <= 0) {
    return res.status(400).json({ error: 'Invalid supplier_id parameter' });
  }

  try {
    const queryConfig = usersRepo.getSupplierById(supplier_id);
    pool.query(queryConfig, (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      if (results.rows.length === 0) {
        return res.status(404).json({ error: 'Supplier not found' });
      }
      return res.json(results.rows[0]);
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getBankDetailsByUserId = async (req, res) => {
  const user_id = parseInt(req.params.user_id, 10);
  if (isNaN(user_id) || user_id <= 0) {
    return res.status(400).json({ error: 'Invalid user_id parameter' });
  }

  try {
    const queryConfig = usersRepo.getBankDetailsByUserId(user_id);
    pool.query(queryConfig, (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      if (results.rows.length === 0) {
        return res.status(404).json({ error: 'Bank details not found for the given user_id' });
      }
      return res.json(results.rows[0]);
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createBankDetails = async (req, res) => {
  const { user_id, bank, account_number, branch, name_in_account } = req.body;

  if (!user_id || !bank || !account_number || !branch || !name_in_account) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const queryConfig = usersRepo.createBankDetails({ user_id, bank, account_number, branch, name_in_account });
    pool.query(queryConfig, (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      return res.status(201).json({ message: 'Bank details created successfully' });
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateSupplier = async (req, res) => {
  const supplier_id = parseInt(req.params.supplier_id, 10);
  const supplierData = req.body;

  if (isNaN(supplier_id) || supplier_id <= 0) {
    return res.status(400).json({ error: 'Invalid supplier_id parameter' });
  }

  try {
    const queryConfig = usersRepo.updateSupplier(supplier_id, supplierData);
    pool.query(queryConfig, (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      return res.json({ message: 'Supplier updated successfully' });
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateEmployee = async (req, res) => {
  const employee_id = parseInt(req.params.employee_id, 10);
  const employeeData = req.body;

  if (isNaN(employee_id) || employee_id <= 0) {
    return res.status(400).json({ error: 'Invalid employee_id parameter' });
  }

  try {
    const queryConfig = usersRepo.updateEmployee(employee_id, employeeData);
    pool.query(queryConfig, (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      return res.json({ message: 'Employee updated successfully' });
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getUsersByType = async (req, res) => {
  try {
    const queryConfig = usersRepo.getUsersByType();
    pool.query(queryConfig, (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      // Group the rows dynamically by their entity_type
      const categorizedData = results.rows.reduce((acc, row) => {
        const type = row.entity_type; // 'driver', 'helper', 'lorry', 'route'
        
        // Push the item into its matching array group
        if (acc[type]) {
          acc[type].push({
            id: row.cid,
            label: row.label
          });
        }
        return acc;
      }, { driver: [], helper: [], lorry: [], route: [] }); // Initializes empty arrays

      // Send the separated object arrays back to your frontend
      return res.json(categorizedData);
    });
  }
  catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { 
  getAllUsers, 
  createSupplier,
  createEmployee,
  getEmployeeById,
  getSupplierById,
  getBankDetailsByUserId,
  createBankDetails,
  updateSupplier,
  updateEmployee,
  getUsersByType
};
