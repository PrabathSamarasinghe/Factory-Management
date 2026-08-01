const createServiceProxy = require("../config/proxy");

module.exports = createServiceProxy(
    process.env.BOUGHT_LEAF_SERVICE_URL,
    "/api/bought-leaf"
);