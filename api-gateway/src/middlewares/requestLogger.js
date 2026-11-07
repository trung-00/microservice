const crypto = require('crypto');

// Chỉ nhận mã yêu cầu do client gửi nếu có dạng an toàn, tránh chèn ký tự lạ vào log.
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

// Ghi MỘT dòng JSON cho mỗi yêu cầu khi trả lời xong.
// Cố ý KHÔNG ghi header (có token) và body (có mật khẩu), cũng không ghi query string.
// Yêu cầu /api/health thành công không ghi để khỏi ngập log (Docker gọi mỗi 3 giây).
function requestLogger({ logger = console } = {}) {
    return (req, res, next) => {
        const startedAt = process.hrtime.bigint();
        const incoming = req.get('x-request-id');
        const requestId = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
        req.id = requestId;
        res.set('X-Request-Id', requestId);

        res.on('finish', () => {
            const path = req.originalUrl.split('?')[0];
            if (path === '/api/health' && res.statusCode === 200) return;

            const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
            const entry = {
                time: new Date().toISOString(),
                level,
                requestId,
                method: req.method,
                path,
                status: res.statusCode,
                ms: Math.round((Number(process.hrtime.bigint() - startedAt) / 1e6) * 10) / 10,
                ip: req.ip,
                uid: req.user ? req.user.uid : undefined,
                role: req.user ? req.user.role : undefined,
                cache: res.get('X-Cache'),
            };
            (level === 'error' ? logger.error : logger.log)(JSON.stringify(entry));
        });
        next();
    };
}

module.exports = { requestLogger };