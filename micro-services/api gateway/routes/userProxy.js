const createServiceProxy = require("../config/proxy");

module.exports = createServiceProxy(
    process.env.USER_MANAGEMENT_SERVICE_URL,
    "/api/users"
);