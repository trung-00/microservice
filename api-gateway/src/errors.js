// Lỗi do chính Gateway phát hiện (thiếu token, sai quyền, body sai hình dạng...)
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

module.exports = { HttpError };