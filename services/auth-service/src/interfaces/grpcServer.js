const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { DomainError } = require('../domain/errors');

// Dịch mã lỗi nghiệp vụ sang mã trạng thái gRPC. Gateway sẽ dịch tiếp sang HTTP (400/409/401).
const STATUS = {
    INVALID_ARGUMENT: grpc.status.INVALID_ARGUMENT,
    ALREADY_EXISTS: grpc.status.ALREADY_EXISTS,
    UNAUTHENTICATED: grpc.status.UNAUTHENTICATED,
};

function handle(fn) {
    return async (call, callback) => {
        try {
            callback(null, await fn(call.request));
        } catch (e) {
            if (e instanceof DomainError) {
                return callback({ code: STATUS[e.code] ?? grpc.status.UNKNOWN, message: e.message });
            }
            console.error('[auth] unexpected error', e);
            callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
        }
    };
}

function startGrpcServer(authService, port) {
    const definition = protoLoader.loadSync(path.join(process.env.PROTO_DIR, 'auth.proto'), {
        keepCase: false, // access_token trong .proto -> accessToken trong JS
        defaults: true,
    });
    const pkg = grpc.loadPackageDefinition(definition).auth;

    const server = new grpc.Server();
    server.addService(pkg.AuthService.service, {
        Register: handle((req) => authService.register(req)),
        Login: handle((req) => authService.login(req)),
        VerifyToken: handle(async (req) => authService.verifyToken(req.token)),
    });

    return new Promise((resolve, reject) => {
        server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
            if (err) return reject(err);
            console.log(`[auth] gRPC listening on :${port}`);
            resolve(server);
        });
    });
}

module.exports = { startGrpcServer };