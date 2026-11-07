// Đọc danh tính người gọi do API Gateway gắn vào gRPC metadata.
function callerOf(metadata) {
    const first = (key) => {
        const values = metadata.get(key);
        return values.length ? String(values[0]) : '';
    };
    return { uid: Number(first('x-user-id')) || 0, role: first('x-user-role') };
}

module.exports = { callerOf };