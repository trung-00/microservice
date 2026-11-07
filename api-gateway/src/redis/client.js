const Redis = require('ioredis');
const config = require('../config');

// Redis chỉ là phần tăng tốc và bảo vệ, không phải nguồn dữ liệu chính. Vì vậy:
// - enableOfflineQueue = false: Redis chưa sẵn sàng thì lệnh lỗi NGAY, không xếp hàng chờ làm treo yêu cầu.
// - commandTimeout: Redis chậm quá 1 giây thì bỏ qua.
// Các middleware bắt lỗi này và cho yêu cầu đi tiếp (fail-open).
function createRedis(logger = console) {
    const redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        connectTimeout: 2000,
        commandTimeout: 1000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (times) => Math.min(times * 200, 2000), // tự kết nối lại, tối đa mỗi 2 giây
    });

    let lastLogged = 0;
    redis.on('error', (e) => {
        const now = Date.now();
        if (now - lastLogged > 10000) {
            lastLogged = now;
            logger.error(`[gateway] Redis error: ${e.message}`);
        }
    });
    redis.on('ready', () => logger.log('[gateway] Redis connected'));
    return redis;
}

module.exports = { createRedis };