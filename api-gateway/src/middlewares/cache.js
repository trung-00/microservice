const MAX_KEY_LENGTH = 200;
const versionKey = (group) => `cache:version:${group}`;

// Cache phản hồi GET (cache-aside) bằng Redis.
// Thứ tự gắn: phải đặt SAU bước xác thực, để người chưa đăng nhập không đọc được dữ liệu từ cache.
// Cách làm mất hiệu lực: mỗi nhóm có một "số phiên bản" nằm trong khóa cache. Muốn xóa cả nhóm chỉ cần tăng
// số này (một lệnh INCR). Khóa cũ không ai truy cập nữa và tự hết hạn theo TTL.
// Nhờ vậy một yêu cầu GET đang chạy dở lúc dữ liệu đổi cũng không ghi đè dữ liệu cũ vào phiên bản mới.
function cacheResponse({ redis, group, ttlSeconds, logger = console }) {
    return async (req, res, next) => {
        if (req.method !== 'GET') return next();

        const url = req.originalUrl;
        // Có query string hoặc đường dẫn quá dài thì không cache (tránh bị lợi dụng để làm đầy Redis).
        if (url.includes('?') || url.length > MAX_KEY_LENGTH) {
            res.set('X-Cache', 'BYPASS');
            return next();
        }

        let key;
        try {
            const version = (await redis.get(versionKey(group))) || '0';
            key = `cache:${group}:v${version}:${url}`;
            const hit = await redis.get(key);
            if (hit !== null && hit !== undefined) {
                res.set('X-Cache', 'HIT');
                return res.status(200).type('application/json').send(hit);
            }
        } catch (e) {
            logger.error(`[gateway] cache skipped (Redis error): ${e.message}`);
            res.set('X-Cache', 'BYPASS');
            return next();
        }

        res.set('X-Cache', 'MISS');
        const sendJson = res.json.bind(res);
        res.json = (body) => {
            // Chỉ lưu phản hồi thành công (200). Lỗi 404, 403... không bao giờ vào cache.
            if (res.statusCode === 200) {
                Promise.resolve(redis.set(key, JSON.stringify(body), 'EX', ttlSeconds)).catch(() => { });
            }
            return sendJson(body);
        };
        next();
    };
}

// Khi một yêu cầu ghi dữ liệu THÀNH CÔNG (mã < 400), làm mất hiệu lực cache của các nhóm trong "groups".
// Việc này xong TRƯỚC khi trả lời, nên người dùng đọc lại ngay sau khi ghi luôn thấy dữ liệu mới.
function invalidateOnSuccess({ redis, groups, methods = ['POST', 'PUT', 'PATCH', 'DELETE'], logger = console }) {
    return (req, res, next) => {
        if (!methods.includes(req.method)) return next();

        const sendJson = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode >= 400) return sendJson(body);
            Promise.all(groups.map((g) => redis.incr(versionKey(g))))
                .catch((e) => logger.error(`[gateway] cache invalidation failed: ${e.message}`))
                .then(() => sendJson(body));
            return res;
        };
        next();
    };
}

module.exports = { cacheResponse, invalidateOnSuccess };