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
  const schema = getSchemaName();
  const { name, nic_number, birthday, photo_url, nic_url, custom_id, route_id } = supplierData;

  const text = `CALL ${schema}.add_supplier($1, $2, $3, $4, $5, $6, $7)`;

  return {
    text,
    values: [name, nic_number, birthday, photo_url, nic_url, custom_id, route_id]
  };
};

const createEmployee = (employeeData) => {
  const schema = getSchemaName();
  const { name, nic_number, birthday, photo_url, nic_url, job, job_title } = employeeData;

  const text = `CALL ${schema}.add_employee($1, $2, $3, $4, $5, $6, $7)`;

  return {
    text,
    values: [name, nic_number, birthday, photo_url, nic_url, job, job_title]
  };
};

const getEmployeeById = (employee_id) => {
  const schema = getSchemaName();
  const text = `SELECT * FROM ${schema}.get_employee_details($1)`;
  return {
    text,
    values: [employee_id]
  };
}

const getSupplierById = (supplier_id) => {
  const schema = getSchemaName();
  const text = `SELECT * FROM ${schema}.get_supplier_details($1)`;
  return {
    text,
    values: [supplier_id]
  };
}

const getBankDetailsByUserId = (user_id) => {
  const schema = getSchemaName();
  const text = `SELECT * FROM ${schema}.get_bank_details_by_user_id($1)`;
  return {
    text,
    values: [user_id]
  };
}

const createBankDetails = (bankDetails) => {
  const schema = getSchemaName();
  const { user_id, bank, account_number, branch, name_in_account } = bankDetails;
  const text = `CALL ${schema}.add_bank_details($1, $2, $3, $4, $5)`;

  return {
    text,
    values: [user_id, bank, account_number, branch, name_in_account]
  };
};

const updateSupplier = (supplier_id, supplierData) => {
  const schema = getSchemaName();
  const { name, nic_number, birthday, photo_url, nic_url, custom_id, route_id } = supplierData;

  const text = `CALL ${schema}.update_supplier($1, $2, $3, $4, $5, $6, $7, $8)`;

  return {
    text,
    values: [supplier_id, name, nic_number, birthday, photo_url, nic_url, custom_id, route_id]
  };
}

const updateEmployee = (employee_id, employeeData) => {
  const schema = getSchemaName();
  const { name, nic_number, birthday, photo_url, nic_url, job, job_title } = employeeData;

  const text = `CALL ${schema}.update_employee($1, $2, $3, $4, $5, $6, $7, $8)`;

  return {
    text,
    values: [employee_id, name, nic_number, birthday, photo_url, nic_url, job, job_title]
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
  updateEmployee
};