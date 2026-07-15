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
  let text = `SELECT * FROM ${schema}.vw_daily_supplier_leaf_summary WHERE supplier_code = $1`;
  const values = [supplierId];

  return {
    text,
    values,
  };
};

const insertBoughtLeafData = (data) => {
  const schema = getSchemaName();
  const text = `CALL ${schema}.create_bought_leaf_record ($1, $2, $3, $4)`;
  const values = [data.supplier_id, data.weight, data.water_deduction, data.tare_deduction];

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