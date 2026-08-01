require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const {authenticateToken} = require("./middleware/auth");
const errorHandler = require("./middleware/errorHandler");

const authProxy = require("./routes/authProxy");
const userProxy = require("./routes/userProxy");
const attendanceProxy = require("./routes/attendanceProxy");
const boughtLeafProxy = require("./routes/boughtLeafProxy");

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

/*
    Public routes
*/
app.use("/api/auth", authProxy);

/*
    Protected routes
*/
app.use("/api/users", authenticateToken, userProxy);

app.use("/api/attendance", authenticateToken, attendanceProxy);

app.use("/api/bought-leaf", authenticateToken, boughtLeafProxy);

/*
    Health check
*/
app.get("/", (req, res) => {
    res.json({
        service: "API Gateway",
        status: "Running"
    });
});

/*
    Error handler
*/
app.use(errorHandler);

app.listen(process.env.PORT, () => {
    console.log(`Gateway running on ${process.env.PORT}`);
});