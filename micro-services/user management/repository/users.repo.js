// Validation utilities
const validatePositiveInteger = (value, fieldName) => {
  if (value === null || value === undefined) {
    throw new Error(`${fieldName} is required`);
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return num;
};

const validateString = (value, fieldName, minLength = 1, maxLength = 255) => {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be between ${minLength} and ${maxLength} characters`);
  }
  return trimmed;
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  return email.trim().toLowerCase();
};

const validateDate = (date) => {
  if (!date) throw new Error('Date is required');
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new Error('Invalid date format');
  }
  return parsedDate.toISOString().split('T')[0];
};

const validateURL = (url, fieldName = 'URL') => {
  if (!url) return null;
  try {
    new URL(url);
    return url;
  } catch {
    throw new Error(`Invalid ${fieldName} format`);
  }
};

const getSchemaName = () => {
  const schema = process.env.DB_SCHEMA || 'public';
  // Allow only valid SQL identifier characters for schema names.
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) ? schema : 'public';
};

const getAllUsers = (user_type) => {
  const schema = getSchemaName();
  
  // Validate user_type to prevent injection
  const viewMap = {
    employee: 'vw_employees',
    supplier: 'vw_suppliers'
  };

  if (!viewMap[user_type]) {
    throw new Error(`Invalid user_type: ${user_type}. Must be 'employee' or 'supplier'`);
  }

  const viewName = viewMap[user_type];
  const text = `SELECT * FROM ${schema}.${viewName}`;

  return {
    text,
    values: []
  };
};

const createSupplier = (supplierData) => {
  if (!supplierData || typeof supplierData !== 'object') {
    throw new Error('Invalid supplier data');
  }
  
  const schema = getSchemaName();
  const name = validateString(supplierData.name, 'name', 1, 100);
  const nic_number = validateString(supplierData.nic_number, 'nic_number', 1, 20);
  const birthday = validateDate(supplierData.birthday);
  const photo_url = validateURL(supplierData.photo_url, 'photo_url');
  const nic_url = validateURL(supplierData.nic_url, 'nic_url');
  const custom_id = supplierData.custom_id ? validatePositiveInteger(supplierData.custom_id, 'custom_id') : null;
  const route_id = supplierData.route_id ? validatePositiveInteger(supplierData.route_id, 'route_id') : null;

  const text = `CALL ${schema}.add_supplier($1, $2, $3, $4, $5, $6, $7)`;

  return {
    text,
    values: [name, nic_number, birthday, photo_url, nic_url, custom_id, route_id]
  };
};

const createEmployee = (employeeData) => {
  if (!employeeData || typeof employeeData !== 'object') {
    throw new Error('Invalid employee data');
  }
  
  const schema = getSchemaName();
  const name = validateString(employeeData.name, 'name', 1, 100);
  const nic_number = validateString(employeeData.nic_number, 'nic_number', 1, 20);
  const birthday = validateDate(employeeData.birthday);
  const photo_url = validateURL(employeeData.photo_url, 'photo_url');
  const nic_url = validateURL(employeeData.nic_url, 'nic_url');
  const job = validateString(employeeData.job, 'job', 1, 50);
  const job_title = validateString(employeeData.job_title, 'job_title', 1, 100);

  const text = `CALL ${schema}.add_employee($1, $2, $3, $4, $5, $6, $7)`;

  return {
    text,
    values: [name, nic_number, birthday, photo_url, nic_url, job, job_title]
  };
};

const getEmployeeById = (employee_id) => {
  const schema = getSchemaName();
  const validatedId = validatePositiveInteger(employee_id, 'employee_id');
  const text = `SELECT * FROM ${schema}.get_employee_details($1)`;
  return {
    text,
    values: [validatedId]
  };
}

const getSupplierById = (supplier_id) => {
  const schema = getSchemaName();
  const validatedId = validatePositiveInteger(supplier_id, 'supplier_id');
  const text = `SELECT * FROM ${schema}.get_supplier_details($1)`;
  return {
    text,
    values: [validatedId]
  };
}

const getBankDetailsByUserId = (user_id) => {
  const schema = getSchemaName();
  const validatedId = validatePositiveInteger(user_id, 'user_id');
  const text = `SELECT * FROM ${schema}.get_bank_details_by_user_id($1)`;
  return {
    text,
    values: [validatedId]
  };
}

const createBankDetails = (bankDetails) => {
  if (!bankDetails || typeof bankDetails !== 'object') {
    throw new Error('Invalid bank details');
  }
  
  const schema = getSchemaName();
  const user_id = validatePositiveInteger(bankDetails.user_id, 'user_id');
  const bank = validateString(bankDetails.bank, 'bank', 1, 100);
  const account_number = validateString(bankDetails.account_number, 'account_number', 1, 30);
  const branch = validateString(bankDetails.branch, 'branch', 1, 100);
  const name_in_account = validateString(bankDetails.name_in_account, 'name_in_account', 1, 150);
  
  const text = `CALL ${schema}.add_bank_details($1, $2, $3, $4, $5)`;

  return {
    text,
    values: [user_id, bank, account_number, branch, name_in_account]
  };
};

const updateSupplier = (supplier_id, supplierData) => {
  if (!supplierData || typeof supplierData !== 'object') {
    throw new Error('Invalid supplier data');
  }
  
  const schema = getSchemaName();
  const validatedId = validatePositiveInteger(supplier_id, 'supplier_id');
  const name = validateString(supplierData.name, 'name', 1, 100);
  const nic_number = validateString(supplierData.nic_number, 'nic_number', 1, 20);
  const birthday = validateDate(supplierData.birthday);
  const photo_url = validateURL(supplierData.photo_url, 'photo_url');
  const nic_url = validateURL(supplierData.nic_url, 'nic_url');
  const custom_id = supplierData.custom_id ? validatePositiveInteger(supplierData.custom_id, 'custom_id') : null;
  const route_id = supplierData.route_id ? validatePositiveInteger(supplierData.route_id, 'route_id') : null;

  const text = `CALL ${schema}.update_supplier($1, $2, $3, $4, $5, $6, $7, $8)`;

  return {
    text,
    values: [validatedId, name, nic_number, birthday, photo_url, nic_url, custom_id, route_id]
  };
}

const updateEmployee = (employee_id, employeeData) => {
  if (!employeeData || typeof employeeData !== 'object') {
    throw new Error('Invalid employee data');
  }
  
  const schema = getSchemaName();
  const validatedId = validatePositiveInteger(employee_id, 'employee_id');
  const name = validateString(employeeData.name, 'name', 1, 100);
  const nic_number = validateString(employeeData.nic_number, 'nic_number', 1, 20);
  const birthday = validateDate(employeeData.birthday);
  const photo_url = validateURL(employeeData.photo_url, 'photo_url');
  const nic_url = validateURL(employeeData.nic_url, 'nic_url');
  const job = validateString(employeeData.job, 'job', 1, 50);
  const job_title = validateString(employeeData.job_title, 'job_title', 1, 100);

  const text = `CALL ${schema}.update_employee($1, $2, $3, $4, $5, $6, $7, $8)`;

  return {
    text,
    values: [validatedId, name, nic_number, birthday, photo_url, nic_url, job, job_title]
  };
};

const getUsersByType = (user_type) => {
  const schema = getSchemaName();

  const query = `SELECT * FROM ${schema}.get_fleet_assignment_data()`;

  return {
    text: query,
    values: []
  };
};

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