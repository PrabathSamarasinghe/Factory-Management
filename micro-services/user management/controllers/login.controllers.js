const pool = require('../config/db');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const loginRepository = require('../repository/login.repo');

const loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const queryConfig = loginRepository.LoginQuery(username);
        pool.query(queryConfig, async (error, results) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (results.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const user = results.rows[0];

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            // Generate JWT token
            const token = jwt.sign({ 
                id: user.id, 
                username: user.username, 
                role: user.role 
            }, process.env.JWT_SECRET, { expiresIn: '1h' });

            return res.json({ 
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            });
        });
    }
    catch (error) {
        console.error('Error during login:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports = {
    loginUser
};