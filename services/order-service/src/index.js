const pool = require('./infrastructure/db');
const { migrate } = require('./infrastructure/migrate');
const orderRepository = require('./infrastructure/orderRepository');
const outboxRepository = require('./infrastructure/outboxRepository');
const eventBus = require('./infrastructure/kafkaProducer');
const customerGateway = require('./infrastructure/customerGateway');
const productGateway = require('./infrastructure/productGateway');
const { createOrderService } = require('./application/orderService');
const { createOutboxPublisher } = require('./application/outboxPublisher');
const { startGrpcServer } = require('./interfaces/grpcServer');
const { startHealthServer } = require('./interfaces/healthServer');

async function main() {
    for (const key of ['DATABASE_URL', 'PROTO_DIR', 'CUSTOMER_GRPC_URL', 'PRODUCT_GRPC_URL', 'KAFKA_BROKERS']) {
        if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
    }

    await migrate();

    // Nơi DUY NHẤT nối các lớp lại với nhau (composition root)
    const orderService = createOrderService({ orderRepository, customerGateway, productGateway });
    const publisher = createOutboxPublisher({
        outboxRepository,
        eventBus,
        intervalMs: Number(process.env.OUTBOX_INTERVAL_MS || 1000),
    });

    await startGrpcServer(orderService, Number(process.env.GRPC_PORT || 50054));
    startHealthServer(Number(process.env.HEALTH_PORT || 8080), () => pool.query('SELECT 1'));
    publisher.start(); // Kafka chưa sẵn sàng thì sự kiện chờ trong Outbox, không làm đơn hàng thất bại

    const shutdown = async () => {
        await publisher.stop();
        await eventBus.disconnect().catch(() => { });
        await pool.end().catch(() => { });
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch((e) => {
    console.error('[order] failed to start:', e);
    process.exit(1);
});