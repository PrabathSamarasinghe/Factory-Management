const createServiceProxy = require("../config/proxy");

module.exports = createServiceProxy(
    process.env.ATTENDANCE_SERVICE_URL,
    "/api/attendance"
);