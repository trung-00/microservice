const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { DomainError } = require('../domain/errors');
const { callerOf } = require('./caller');

const STATUS = {
    INVALID_ARGUMENT: grpc.status.INVALID_ARGUMENT,
    NOT_FOUND: grpc.status.NOT_FOUND,
    PERMISSION_DENIED: grpc.status.PERMISSION_DENIED,
    FAILED_PRECONDITION: grpc.status.FAILED_PRECONDITION,
    UNAVAILABLE: grpc.status.UNAVAILABLE,
};

function handle(fn) {
    return async (call, callback) => {
        try {
            callback(null, await fn(call.request, callerOf(call.metadata)));
        } catch (e) {
            if (e instanceof DomainError) {
                return callback({ code: STATUS[e.code] ?? grpc.status.UNKNOWN, message: e.message });
            }
            console.error('[order] unexpected error', e);
            callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
        }
    };
}

function startGrpcServer(orderService, port) {
    const definition = protoLoader.loadSync(path.join(process.env.PROTO_DIR, 'order.proto'), {
        keepCase: false, // unit_price trong .proto -> unitPrice trong JS
        defaults: true,
    });
    const pkg = grpc.loadPackageDefinition(definition).order;

    const server = new grpc.Server();
    server.addService(pkg.OrderService.service, {
        CreateOrder: handle((req, caller) => orderService.create(req, caller)),
        ListOrders: handle(async (req, caller) => ({ items: await orderService.list(req, caller) })),
        GetOrder: handle((req, caller) => orderService.get(req.oid, caller)),
    });

    return new Promise((resolve, reject) => {
        server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
            if (err) return reject(err);
            console.log(`[order] gRPC listening on :${port}`);
            resolve(server);
        });
    });
}

module.exports = { startGrpcServer };