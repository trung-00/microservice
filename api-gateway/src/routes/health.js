const express = require('express');

// API-HEALTH-01. Sẽ mở rộng kiểm tra các phụ thuộc (Redis, Kafka...) ở Bước 8.
module.exports = function healthRoutes() {
    const router = express.Router();
    router.get('/', (req, res) => {
        res.status(200).json({ status: 'UP', message: 'E-commerce API is running' });
    });
    return router;
};