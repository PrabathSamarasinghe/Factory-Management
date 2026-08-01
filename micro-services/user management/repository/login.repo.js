const getSchemaName = () => {
  const schema = process.env.DB_SCHEMA || 'public';
  // Allow only valid SQL identifier characters for schema names.
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) ? schema : 'public';
};

const LoginQuery = (username) => {
  const schema = getSchemaName();
  const query = `SELECT * FROM ${schema}.admins WHERE username = $1`;
  return {
    text: query,
    values: [username]
  };
}

module.exports = {
  LoginQuery
};