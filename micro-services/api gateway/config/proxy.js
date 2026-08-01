const { createProxyMiddleware } = require("http-proxy-middleware");

const createServiceProxy = (target, path) => {
    return createProxyMiddleware({
        target,
        changeOrigin: true,

        pathRewrite: {
            [`^${path}`]: ""
        },

        onError(err, req, res) {
            console.error(err);

            res.status(500).json({
                success: false,
                message: "Gateway Error"
            });
        }
    });
};

module.exports = createServiceProxy;