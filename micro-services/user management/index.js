const { config } = require('dotenv');
config(); // Load environment variables from .env file

//Required packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const usersRoutes = require('./routes/users.routes');

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cors());


app.get('/', (req, res) => {
    res.send('User Management microservice is running');
});

app.use('/users', usersRoutes);

app.listen(process.env.PORT, () => {
    console.log(`User Management microservice is running on port ${process.env.PORT}`);
});