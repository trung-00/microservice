const http = require('http');

// isReady: hàm async kiểm tra phụ thuộc (ở đây là DB). Ném lỗi => trả 503.
function startHealthServer(port, isReady) {
    const server = http.createServer(async (req, res) => {
        if (req.url !== '/health') {
            res.writeHead(404);
            return res.end();
        }
        try {
            await isReady();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'UP', service: 'auth-service' }));
        } catch {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'DOWN', service: 'auth-service' }));
        }
    });
    server.listen(port, '0.0.0.0', () => console.log(`[auth] health on :${port}/health`));
    return server;
}

module.exports = { startHealthServer };