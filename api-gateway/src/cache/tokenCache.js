const crypto = require('crypto');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// Đọc thời điểm hết hạn (exp) trong payload của JWT chỉ để GIỚI HẠN thời gian cache.
// Không dùng để tin token: việc xác thực thật luôn do Auth Service làm trước khi kết quả được lưu.
function secondsUntilExpiry(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        if (typeof payload.exp !== 'number') return 0;
        return Math.floor(payload.exp - Date.now() / 1000);
    } catch {
        return 0;
    }
}

// Bọc hàm verifyToken (gọi gRPC sang Auth Service) bằng cache trong Redis, để không phải hỏi Auth Service
// ở MỌI yêu cầu. Quy tắc an toàn:
// - Khóa là SHA-256 của token: Redis không bao giờ chứa token gốc.
// - Chỉ lưu kết quả "hợp lệ". Token sai hoặc hết hạn luôn được hỏi lại Auth Service.
// - Thời gian lưu = min(maxTtlSeconds, thời gian còn lại của token): không bao giờ chấp nhận token đã hết hạn.
// - Redis lỗi thì hỏi thẳng Auth Service (fail-open).
function withTokenCache(verifyToken, { redis, maxTtlSeconds = 60, logger = console }) {
    return async (token) => {
        const key = `cache:token:${sha256(token)}`;
        try {
            const hit = await redis.get(key);
            if (hit) return JSON.parse(hit);
        } catch (e) {
            logger.error(`[gateway] token cache skipped (Redis error): ${e.message}`);
        }

        const result = await verifyToken(token);
        if (result && result.valid) {
            const ttl = Math.min(maxTtlSeconds, secondsUntilExpiry(token));
            if (ttl > 0) {
                const value = JSON.stringify({ valid: true, uid: result.uid, role: result.role });
                Promise.resolve(redis.set(key, value, 'EX', ttl)).catch(() => { });
            }
        }
        return result;
    };
}

module.exports = { withTokenCache };