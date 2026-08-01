const { config } = require('dotenv');
config(); // Load environment variables from .env file

//Required packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const attendanceRoutes = require('./routes/attendance.route');

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cors());


app.get('/health', (req, res) => {
    res.send('Attendance microservice is running');
});

app.use('/', attendanceRoutes);

app.listen(process.env.PORT, () => {
    console.log(`Attendance microservice is running on port ${process.env.PORT}`);
});