const travelRepo = require("../repository/trip.repo");
const pool = require("../config/db");

// Validation functions
const validateLorryPayload = (payload = {}) => {
    const { lorry_number, mileage, lorry_id } = payload;

    if (lorry_number && (typeof lorry_number !== 'string' || lorry_number.trim().length === 0)) {
        return 'lorry_number must be a non-empty string';
    }

    if (mileage !== undefined && (typeof mileage !== 'number' || mileage < 0 || !Number.isInteger(mileage))) {
        return 'mileage must be a positive integer';
    }

    if (lorry_id && (!Number.isInteger(Number(lorry_id)) || Number(lorry_id) <= 0)) {
        return 'lorry_id must be a positive integer';
    }

    return null;
};

const validateRoutePayload = (payload = {}) => {
    const { line_name } = payload;

    if (!line_name || typeof line_name !== 'string' || line_name.trim().length === 0) {
        return 'line_name is required and must be a non-empty string';
    }

    return null;
};

const validateTripPayload = (payload = {}) => {
    const { route_id, lorry_id, driver_id, helper_id, start_mileage, end_mileage } = payload;

    if (!route_id || !Number.isInteger(Number(route_id)) || Number(route_id) <= 0) {
        return 'route_id is required and must be a positive integer';
    }

    if (!lorry_id || !Number.isInteger(Number(lorry_id)) || Number(lorry_id) <= 0) {
        return 'lorry_id is required and must be a positive integer';
    }

    if (!driver_id || !Number.isInteger(Number(driver_id)) || Number(driver_id) <= 0) {
        return 'driver_id is required and must be a positive integer';
    }

    if (!helper_id || !Number.isInteger(Number(helper_id)) || Number(helper_id) <= 0) {
        return 'helper_id is required and must be a positive integer';
    }

    if (!start_mileage || !Number.isInteger(Number(start_mileage)) || Number(start_mileage) <= 0) {
        return 'start_mileage is required and must be a positive integer';
    }

    return null;
};

const validateEndMileagePayload = (payload = {}) => {
    const { trip_id, end_mileage } = payload;

    if (!trip_id || !Number.isInteger(Number(trip_id)) || Number(trip_id) <= 0) {
        return 'trip_id is required and must be a positive integer';
    }

    if (!end_mileage || !Number.isInteger(Number(end_mileage)) || Number(end_mileage) <= 0) {
        return 'end_mileage is required and must be a positive integer';
    }

    return null;
};

const getAllLorries = async (req, res) => {
    try {
        const queryConfig = travelRepo.getAllLorries();
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

const createLorry = async (req, res) => {
    const validationError = validateLorryPayload(req.body);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const queryConfig = travelRepo.createLorry(req.body);
        pool.query(queryConfig, (error) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(201).json({ message: 'Lorry created successfully' });
        });
    } catch (err) {
        console.error('Validation error:', err);
        return res.status(400).json({ error: err.message });
    }
};

const updateLorry = async (req, res) => {
    const validationError = validateLorryPayload(req.body);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const queryConfig = travelRepo.updateLorry(req.body);
        pool.query(queryConfig, (error) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(200).json({ message: 'Lorry updated successfully' });
        });
    } catch (err) {
        console.error('Validation error:', err);
        return res.status(400).json({ error: err.message });
    }
};

const deleteLorry = async (req, res) => {
    const lorryId = req.params.lorryId;

    if (!/^\d+$/.test(lorryId)) {
        return res.status(400).json({ error: 'Invalid lorryId format' });
    }

    try {
        const queryConfig = travelRepo.deleteLorry(lorryId);
        pool.query(queryConfig, (error) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(200).json({ message: 'Lorry deleted successfully' });
        });
    } catch (err) {
        console.error('Validation error:', err);
        return res.status(400).json({ error: err.message });
    }
};

const addRoute = async (req, res) => {
    const validationError = validateRoutePayload(req.body);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const queryConfig = travelRepo.addRoute(req.body);
        pool.query(queryConfig, (error) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(201).json({ message: 'Route added successfully' });
        });
    } catch (err) {
        console.error('Validation error:', err);
        return res.status(400).json({ error: err.message });
    }
};

const getAllRoutes = async (req, res) => {
    try {
        const queryConfig = travelRepo.getAllRoutes();
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

const createTrip = async (req, res) => {
    const validationError = validateTripPayload(req.body);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const queryConfig = travelRepo.createTrip(req.body);
        pool.query(queryConfig, (error) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(201).json({ message: 'Trip created successfully' });
        });
    } catch (err) {
        console.error('Validation error:', err);
        return res.status(400).json({ error: err.message });
    }
};

const updateEndMileage = async (req, res) => {
    const validationError = validateEndMileagePayload(req.body);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const queryConfig = travelRepo.updateEndMileage(req.body);
        pool.query(queryConfig, (error) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(200).json({ message: 'End mileage updated successfully' });
        });
    } catch (err) {
        console.error('Validation error:', err);
        return res.status(400).json({ error: err.message });
    }
};

const getAllTrips = async (req, res) => {
    try {
        const queryConfig = travelRepo.getAllTrips();
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