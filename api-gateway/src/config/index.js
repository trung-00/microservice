module.exports = {
    port: Number(process.env.PORT || 8080),
    protoDir: process.env.PROTO_DIR || '/app/proto',
    authUrl: process.env.AUTH_GRPC_URL || 'auth-service:50051',
    customerUrl: process.env.CUSTOMER_GRPC_URL || 'customer-service:50052',
    productUrl: process.env.PRODUCT_GRPC_URL || 'product-service:50053',
    grpcTimeoutMs: Number(process.env.GRPC_TIMEOUT_MS || 3000),
};