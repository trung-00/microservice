// Số nguyên dương từ biến môi trường; sai hoặc thiếu thì dùng giá trị mặc định.
const int = (name, fallback) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
};

module.exports = {
    port: Number(process.env.PORT || 8080),
    protoDir: process.env.PROTO_DIR || '/app/proto',
    authUrl: process.env.AUTH_GRPC_URL || 'auth-service:50051',
    customerUrl: process.env.CUSTOMER_GRPC_URL || 'customer-service:50052',
    productUrl: process.env.PRODUCT_GRPC_URL || 'product-service:50053',
    orderUrl: process.env.ORDER_GRPC_URL || 'order-service:50054',
    shipmentUrl: process.env.SHIPMENT_GRPC_URL || 'shipment-service:50055',
    grpcTimeoutMs: Number(process.env.GRPC_TIMEOUT_MS || 3000),

    redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: int('REDIS_PORT', 6379),
        password: process.env.REDIS_PASSWORD || undefined,
    },
    // Giới hạn tốc độ theo địa chỉ IP, trong một cửa sổ thời gian cố định.
    rateLimit: {
        global: { max: int('RATE_LIMIT_GLOBAL_MAX', 300), windowMs: int('RATE_LIMIT_GLOBAL_WINDOW_MS', 60000) },
        // /api/auth/* chặt hơn để chống dò mật khẩu.
        auth: { max: int('RATE_LIMIT_AUTH_MAX', 30), windowMs: int('RATE_LIMIT_AUTH_WINDOW_MS', 60000) },
    },
    cache: {
        ttlSeconds: int('CACHE_TTL_SECONDS', 30), // cache danh sách và chi tiết sản phẩm
        tokenMaxSeconds: int('TOKEN_CACHE_MAX_SECONDS', 60), // cache kết quả xác thực token
    },
};