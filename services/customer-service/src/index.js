const pool = require('./infrastructure/db');
const { migrate } = require('./infrastructure/migrate');
const customerRepository = require('./infrastructure/customerRepository');
const { createCustomerService } = require('./application/customerService');
const { startGrpcServer } = require('./interfaces/grpcServer');
const { startHealthServer } = require('./interfaces/healthServer');

async function main() {
    for (const key of ['DATABASE_URL', 'PROTO_DIR']) {
        if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
    }

    await migrate();

    // Nơi DUY NHẤT nối các lớp lại với nhau (composition root)
    const customerService = createCustomerService({ customerRepository });

    await startGrpcServer(customerService, Number(process.env.GRPC_PORT || 50052));
    startHealthServer(Number(process.env.HEALTH_PORT || 8080), () => pool.query('SELECT 1'));
}

main().catch((e) => {
    console.error('[customer] failed to start:', e);
    process.exit(1);
});