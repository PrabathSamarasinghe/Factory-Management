const boughtLeafRepo = require('../repository/boughtLeaf.repo');
const pool = require('../config/db');

const isNonNegativeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
};

const validateInsertPayload = (payload = {}) => {
    const { supplier_id, weight, water_deduction, tare_deduction } = payload;

    if (!Number.isInteger(Number(supplier_id)) || Number(supplier_id) <= 0) {
        return 'supplier_id must be a positive integer';
    }

    if (!isNonNegativeNumber(weight)) {
        return 'weight must be a non-negative number';
    }

    if (!isNonNegativeNumber(water_deduction)) {
        return 'water_deduction must be a non-negative number';
    }

    if (!isNonNegativeNumber(tare_deduction)) {
        return 'tare_deduction must be a non-negative number';
    }

    return null;
};

const getBoughtLeafData = (req, res) => {
    const query = boughtLeafRepo.getBoughtLeafData();
    pool.query(query, (error, results) => {
        if (error) {
            console.error('Error executing query:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        return res.json(results.rows);
    });
};

const getBoughtLeafDataBySupplier = (req, res) => {
    const supplierId = String(req.params.supplierId || '').trim();

    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(supplierId)) {
        return res.status(400).json({ error: 'Invalid supplierId format' });
    }

    try {
        const queryConfig = boughtLeafRepo.getBoughtLeafDataBySupplier(supplierId);
        
        pool.query(queryConfig, (error, results) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            if (!results.rows.length) {
                return res.status(404).json({ error: 'Supplier not found' });
            }

            return res.status(200).json(results.rows);
        });
    } catch (err) {
        console.error('Validation error:', err);
        return res.status(400).json({ error: err.message });
    }
};

const insertBoughtLeafData = (req, res) => {
    const data = req.body;
    const validationError = validateInsertPayload(data);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const queryConfig = boughtLeafRepo.insertBoughtLeafData(data);
        
        pool.query(queryConfig, (error) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(201).json({ message: 'Bought leaf data inserted successfully' });
        });
    } catch (err) {
        console.error('Validation error:', err);
        return res.status(400).json({ error: err.message });
    }
};



module.exports = { 
    getBoughtLeafData,
    getBoughtLeafDataBySupplier,
    insertBoughtLeafData
};