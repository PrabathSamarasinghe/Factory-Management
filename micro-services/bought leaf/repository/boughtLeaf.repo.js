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

const validatePositiveNumber = (value, fieldName) => {
  if (value === null || value === undefined) {
    throw new Error(`${fieldName} is required`);
  }
  const num = Number(value);
  if (isNaN(num) || num < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return num;
};

const getSchemaName = () => {
  const schema = process.env.DB_SCHEMA || 'public';
  // Allow only valid SQL identifier characters for schema names.
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) ? schema : 'public';
};

const getBoughtLeafData = () => {
  const schema = getSchemaName();
  return {
    text: `SELECT * FROM ${schema}.vw_daily_supplier_leaf_summary`,
    values: [],
  };
};

const getBoughtLeafDataBySupplier = (supplierId) => {
  const schema = getSchemaName();
  
  if (!supplierId || typeof supplierId !== 'string') {
    throw new Error('supplierId must be a non-empty string');
  }
  
  const validatedId = supplierId.trim();
  let text = `SELECT * FROM ${schema}.vw_daily_supplier_leaf_summary WHERE supplier_code = $1`;
  const values = [validatedId];

  return {
    text,
    values,
  };
};

const insertBoughtLeafData = (data) => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid bought leaf data');
  }
  
  const schema = getSchemaName();
  const supplier_id = validatePositiveInteger(data.supplier_id, 'supplier_id');
  const weight = validatePositiveNumber(data.weight, 'weight');
  const water_deduction = validatePositiveNumber(data.water_deduction, 'water_deduction');
  const tare_deduction = validatePositiveNumber(data.tare_deduction, 'tare_deduction');
  
  const text = `CALL ${schema}.create_bought_leaf_record ($1, $2, $3, $4)`;
  const values = [supplier_id, weight, water_deduction, tare_deduction];

  return {
    text,
    values,
  };
}


module.exports = { 
    getBoughtLeafData,
    getBoughtLeafDataBySupplier,
    insertBoughtLeafData
};