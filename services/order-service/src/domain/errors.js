// Lỗi nghiệp vụ. Dùng "code" dạng chữ, KHÔNG phụ thuộc gRPC hay HTTP.
class DomainError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'DomainError';
        // INVALID_ARGUMENT | NOT_FOUND | PERMISSION_DENIED | FAILED_PRECONDITION | UNAVAILABLE
        this.code = code;
    }
}

module.exports = { DomainError };