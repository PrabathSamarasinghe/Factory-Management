const boughtLeafRepo = require('../repository/boughtLeaf.repo');
const pool = require('../config/DB');

const getBoughtLeafData = (req, res) => {
    // Your logic to fetch bought leaf data from the database
    const query = boughtLeafRepo.getBoughtLeafData();
    pool.query(query, (error, results) => {
        if (error) {
            console.error('Error executing query:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
        res.json(results.rows);
    })
};

module.exports = { 
    getBoughtLeafData 
};