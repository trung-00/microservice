const mongo = require('./infrastructure/mongo');
const productRepository = require('./infrastructure/productRepository');
const { seedIfEmpty } = require('./infrastructure/seed');
const { createProductService } = require('./application/productService');
const { startGrpcServer } = require('./interfaces/grpcServer');
const { startHealthServer } = require('./interfaces/healthServer');

async function main() {
    for (const key of ['MONGO_URL', 'PROTO_DIR']) {
        if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
    }

    await mongo.connect(process.env.MONGO_URL);
    const seeded = await seedIfEmpty();
    if (seeded) console.log(`[product] seeded ${seeded} sample products`);

    // Nơi DUY NHẤT nối các lớp lại với nhau (composition root)
    const productService = createProductService({ productRepository });

    await startGrpcServer(productService, Number(process.env.GRPC_PORT || 50053));
    startHealthServer(Number(process.env.HEALTH_PORT || 8080), () => mongo.ping());
}

main().catch((e) => {
    console.error('[product] failed to start:', e);
    process.exit(1);
});