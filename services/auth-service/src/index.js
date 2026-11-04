const pool = require('./infrastructure/db');
const { migrate } = require('./infrastructure/migrate');
const userRepository = require('./infrastructure/userRepository');
const passwordHasher = require('./infrastructure/passwordHasher');
const tokenService = require('./infrastructure/tokenService');
const { createAuthService } = require('./application/authService');
const { startGrpcServer } = require('./interfaces/grpcServer');
const { startHealthServer } = require('./interfaces/healthServer');

async function main() {
    for (const key of ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_PASSWORD', 'PROTO_DIR']) {
        if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
    }

    await migrate();

    // Nơi DUY NHẤT nối các lớp lại với nhau (composition root)
    const authService = createAuthService({ userRepository, passwordHasher, tokenService });

    await startGrpcServer(authService, Number(process.env.GRPC_PORT || 50051));
    startHealthServer(Number(process.env.HEALTH_PORT || 8080), () => pool.query('SELECT 1'));
}

main().catch((e) => {
    console.error('[auth] failed to start:', e);
    process.exit(1);
});