const pool = require('./infrastructure/db');
const { migrate } = require('./infrastructure/migrate');
const orderRepository = require('./infrastructure/orderRepository');
const customerGateway = require('./infrastructure/customerGateway');
const productGateway = require('./infrastructure/productGateway');
const { createOrderService } = require('./application/orderService');
const { startGrpcServer } = require('./interfaces/grpcServer');
const { startHealthServer } = require('./interfaces/healthServer');

async function main() {
    for (const key of ['DATABASE_URL', 'PROTO_DIR', 'CUSTOMER_GRPC_URL', 'PRODUCT_GRPC_URL']) {
        if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
    }

    await migrate();

    // Nơi DUY NHẤT nối các lớp lại với nhau (composition root)
    const orderService = createOrderService({ orderRepository, customerGateway, productGateway });

    await startGrpcServer(orderService, Number(process.env.GRPC_PORT || 50054));
    startHealthServer(Number(process.env.HEALTH_PORT || 8080), () => pool.query('SELECT 1'));
}

main().catch((e) => {
    console.error('[order] failed to start:', e);
    process.exit(1);
});