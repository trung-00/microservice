// Lỗi nghiệp vụ. Dùng "code" dạng chữ, KHÔNG phụ thuộc gRPC hay HTTP.
class DomainError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'DomainError';
        this.code = code; // INVALID_ARGUMENT | NOT_FOUND
    }
}

module.exports = { DomainError };