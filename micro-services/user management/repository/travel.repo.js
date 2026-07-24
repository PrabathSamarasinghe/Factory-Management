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

const getSchemaName = () => {
  const schema = process.env.DB_SCHEMA || 'public';
  // Allow only valid SQL identifier characters for schema names.
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) ? schema : 'public';
};
    

const getAllLorries = () => {
    const schema = getSchemaName();
    const query = `SELECT * FROM ${schema}.lorry`;
    return {
        text: query,
        values: []
    };
}

const createLorry = (lorryData) => {
    if (!lorryData || typeof lorryData !== 'object') {
        throw new Error('Invalid lorry data');
    }
    
    const schema = getSchemaName();
    const lorry_number = validateString(lorryData.lorry_number, 'lorry_number', 1, 50);
    const mileage = validatePositiveInteger(lorryData.mileage, 'mileage');
    
    const query = `
        INSERT INTO ${schema}.lorry (lorry_number, mileage) 
        VALUES ($1, $2)`
    ;
    
    return {
        text: query,
        values: [lorry_number, mileage]
    };
}

const updateLorry = (lorryData) => {
    if (!lorryData || typeof lorryData !== 'object') {
        throw new Error('Invalid lorry data');
    }
    
    const schema = getSchemaName();
    const lorry_id = validatePositiveInteger(lorryData.lorry_id, 'lorry_id');
    const lorry_number = validateString(lorryData.lorry_number, 'lorry_number', 1, 50);
    const mileage = validatePositiveInteger(lorryData.mileage, 'mileage');

    const query = `
        UPDATE ${schema}.lorry 
        SET lorry_number = $1, mileage = $2 
        WHERE id = $3
    `;
    return {
        text: query,
        values: [lorry_number, mileage, lorry_id]
    };
}

const deleteLorry = (lorry_id) => {
    const schema = getSchemaName();
    const validatedId = validatePositiveInteger(lorry_id, 'lorry_id');
    
    const query = `DELETE FROM ${schema}.lorry WHERE id = $1`;

    return {
        text: query,
        values: [validatedId]
    };
}

const addRoute = (routeData) => {
    if (!routeData || typeof routeData !== 'object') {
        throw new Error('Invalid route data');
    }
    
    const schema = getSchemaName();
    const line_name = validateString(routeData.line_name, 'line_name', 1, 100);

    const query = `INSERT INTO ${schema}.routes (line_name) VALUES ($1)`;

    return {
        text: query,
        values: [line_name]
    };
}

const getAllRoutes = () => {
    const schema = getSchemaName();
    const query = `SELECT * FROM ${schema}.routes`;
    return {
        text: query,
        values: []
    };
}

const getAllTrips = () => {
    const schema = getSchemaName();
    const query = `SELECT * FROM ${schema}.trip`;

    return {
        text: query,
        values: []
    };
}


const createTrip = (tripData) => {
    if (!tripData || typeof tripData !== 'object') {
        throw new Error('Invalid trip data');
    }
    
    const schema = getSchemaName();
    const route_id = validatePositiveInteger(tripData.route_id, 'route_id');
    const lorry_id = validatePositiveInteger(tripData.lorry_id, 'lorry_id');
    const driver_id = validatePositiveInteger(tripData.driver_id, 'driver_id');
    const helper_id = validatePositiveInteger(tripData.helper_id, 'helper_id');
    const start_mileage = validatePositiveInteger(tripData.start_mileage, 'start_mileage');
    const end_mileage = tripData.end_mileage ? validatePositiveInteger(tripData.end_mileage, 'end_mileage') : null;

    const query = `INSERT INTO ${schema}.trip (route_id, lorry_id, driver_id, helper_id, start_mileage, end_mileage) VALUES ($1, $2, $3, $4, $5, $6)`;

    return {
        text: query,
        values: [route_id, lorry_id, driver_id, helper_id, start_mileage, end_mileage]
    };
}

const updateEndMileage = (tripData) => {
    if (!tripData || typeof tripData !== 'object') {
        throw new Error('Invalid trip data');
    }
    
    const schema = getSchemaName();
    const trip_id = validatePositiveInteger(tripData.trip_id, 'trip_id');
    const end_mileage = validatePositiveInteger(tripData.end_mileage, 'end_mileage');

    const query = `UPDATE ${schema}.trip SET end_mileage = $1 WHERE id = $2`;

    return {
        text: query,
        values: [end_mileage, trip_id]
    };
}

module.exports = {
    getAllLorries,
    createLorry,
    updateLorry,
    deleteLorry,
    addRoute,
    getAllRoutes,
    createTrip,
    updateEndMileage,
    getAllTrips
};