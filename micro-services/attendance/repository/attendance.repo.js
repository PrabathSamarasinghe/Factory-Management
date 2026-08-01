const getSchemaName = () => {
  const schema = process.env.DB_SCHEMA || 'public';
  // Allow only valid SQL identifier characters for schema names.
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) ? schema : 'public';
};

const validatePositiveInteger = (num, fieldName) => {
  if (num === null || num === undefined) {
    throw new Error(`${fieldName} is required`);
  }
    const parsedNum = Number(num);
    if (!Number.isInteger(parsedNum) || parsedNum <= 0) {
        throw new Error(`${fieldName} must be a positive integer`);
    }
    return parsedNum;
}

const getAttendanceData = (date) => {
  const schema = getSchemaName();
  return {
    text: `SELECT * FROM ${schema}.vw_employee_attendance_overtime WHERE date::date = $1`,
    values: [date],
  };
}

const getAttendanceDataByEmployee = (employeeId, date) => {
  const schema = getSchemaName();
    if (!employeeId || typeof employeeId !== 'string') {
        throw new Error('employeeId must be a non-empty string');
    }
    const validatedId = employeeId.trim();
    let text = `SELECT * FROM ${schema}.vw_employee_attendance_overtime WHERE employee_id = $1 and date::date = $2`;
    const values = [validatedId, date];

    return {
        text,
        values,
    };
}

const manageAttendanceData = (employeeId) => {
  const schema = getSchemaName();
  if (!employeeId || typeof employeeId !== 'string') {
      throw new Error('employeeId must be a non-empty string');
  }
  const validatedId = employeeId.trim();
  let text = `SELECT ${schema}.manage_employee_attendance($1)`;
  const values = [validatedId];

  return {
    text,
    values,
  };
};

module.exports = {
  getAttendanceData,
  getAttendanceDataByEmployee,
  manageAttendanceData,
};