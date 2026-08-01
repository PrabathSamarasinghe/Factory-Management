const { createProxyMiddleware } = require("http-proxy-middleware");

const createServiceProxy = (target) => {
    if (!target) {
        throw new Error("Proxy target is not configured");
    }

    return createProxyMiddleware({
        target,
        changeOrigin: true,
        xfwd: true,
        timeout: 10000,
        proxyTimeout: 10000,

        onError(err, req, res) {
            console.error(err);

            if (res.headersSent) {
                return;
            }

            res.status(502).json({
                success: false,
                message: "Gateway proxy error"
            });
        }
    });
};

module.exports = createServiceProxy;