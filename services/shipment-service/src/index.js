const mongo = require('./infrastructure/mongo');
const shipmentRepository = require('./infrastructure/shipmentRepository');
const kafkaConsumer = require('./infrastructure/kafkaConsumer');
const { createShipmentService } = require('./application/shipmentService');
const { startGrpcServer } = require('./interfaces/grpcServer');
const { startHealthServer } = require('./interfaces/healthServer');

async function main() {
    for (const key of ['MONGO_URL', 'PROTO_DIR', 'KAFKA_BROKERS']) {
        if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
    }

    await mongo.connect(process.env.MONGO_URL);
    await shipmentRepository.init();

    // Nơi DUY NHẤT nối các lớp lại với nhau (composition root)
    const shipmentService = createShipmentService({ shipmentRepository, deadLetter: kafkaConsumer.deadLetter });

    await startGrpcServer(shipmentService, Number(process.env.GRPC_PORT || 50055));
    startHealthServer(Number(process.env.HEALTH_PORT || 8080), async () => {
        await mongo.ping();
        if (!kafkaConsumer.isRunning()) throw new Error('Kafka consumer is not running');
    });

    // Bộ nhận sự kiện chạy nền: một sự kiện lỗi không làm sập service.
    kafkaConsumer
        .start((text, meta) => shipmentService.handleOrderCreated(text, meta))
        .then(() => console.log('[shipment] consuming order-created'))
        .catch((e) => {
            console.error('[shipment] Kafka consumer failed to start:', e);
            process.exit(1);
        });

    const shutdown = async () => {
        await kafkaConsumer.stop();
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch((e) => {
    console.error('[shipment] failed to start:', e);
    process.exit(1);
});