const { HttpError } = require('../errors');

// Mã trạng thái gRPC -> mã HTTP (bảng trong README)
const HTTP_BY_GRPC = {
    3: 400, // INVALID_ARGUMENT
    4: 504, // DEADLINE_EXCEEDED
    5: 404, // NOT_FOUND
    6: 409, // ALREADY_EXISTS
    7: 403, // PERMISSION_DENIED
    9: 409, // FAILED_PRECONDITION
    14: 503, // UNAVAILABLE
    16: 401, // UNAUTHENTICATED
};

function toHttpError(err) {
    if (err instanceof HttpError) return { status: err.status, message: err.message };
    if (err && err.type === 'entity.parse.failed') return { status: 400, message: 'Invalid JSON body' };
    if (err && typeof err.code === 'number' && HTTP_BY_GRPC[err.code]) {
        const status = HTTP_BY_GRPC[err.code];
        // Lỗi hạ tầng (5xx) không lộ chi tiết nội bộ ra ngoài
        return { status, message: status >= 500 ? 'Service temporarily unavailable' : err.details || err.message };
    }
    return { status: 500, message: 'Internal server error' };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const { status, message } = toHttpError(err);
    if (status >= 500) console.error('[gateway]', req.method, req.originalUrl, '->', status, err);
    res.status(status).json({ message });
}

module.exports = { toHttpError, errorHandler };