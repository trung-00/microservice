// Giới hạn tốc độ bằng bộ đếm trong Redis (cửa sổ cố định): mỗi khóa đếm số yêu cầu trong windowMs.
// - INCR + PEXPIRE NX + PTTL chạy trong một giao dịch MULTI nên không bị lệch khi nhiều bản Gateway cùng chạy.
// - PEXPIRE ... NX cần Redis từ 7.0 trở lên (dự án dùng redis:7).
// - Redis lỗi thì cho qua (fail-open): Redis hỏng không được làm cả hệ thống ngừng phục vụ.
function rateLimit({ redis, name, max, windowMs, keyFn = (req) => req.ip, skip = () => false, logger = console }) {
    let lastLogged = 0;
    const logOnce = (message) => {
        const now = Date.now();
        if (now - lastLogged > 10000) {
            lastLogged = now;
            logger.error(message);
        }
    };

    return async (req, res, next) => {
        if (skip(req)) return next();

        const key = `ratelimit:${name}:${keyFn(req)}`;
        let count;
        let ttlMs;
        try {
            const results = await redis.multi().incr(key).pexpire(key, windowMs, 'NX').pttl(key).exec();
            const failed = results.find(([err]) => err);
            if (failed) throw failed[0];
            count = results[0][1];
            ttlMs = results[2][1];
            if (ttlMs < 0) {
                // Khóa chưa có hạn (hiếm: lỗi giữa chừng). Đặt lại để không bị đếm mãi mãi.
                await redis.pexpire(key, windowMs);
                ttlMs = windowMs;
            }
        } catch (e) {
            logOnce(`[gateway] rate limiter "${name}" skipped (Redis error): ${e.message}`);
            return next();
        }

        const resetSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
        res.set({
            'X-RateLimit-Limit': String(max),
            'X-RateLimit-Remaining': String(Math.max(0, max - count)),
            'X-RateLimit-Reset': String(resetSeconds),
        });
        if (count > max) {
            res.set('Retry-After', String(resetSeconds));
            return res.status(429).json({ message: 'Too many requests, please try again later' });
        }
        next();
    };
}

module.exports = { rateLimit };