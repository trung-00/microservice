const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { DomainError } = require('../domain/errors');
const { callerOf } = require('./caller');

const STATUS = {
    INVALID_ARGUMENT: grpc.status.INVALID_ARGUMENT,
    NOT_FOUND: grpc.status.NOT_FOUND,
    PERMISSION_DENIED: grpc.status.PERMISSION_DENIED,
};

function handle(fn) {
    return async (call, callback) => {
        try {
            callback(null, await fn(call.request, callerOf(call.metadata)));
        } catch (e) {
            if (e instanceof DomainError) {
                return callback({ code: STATUS[e.code] ?? grpc.status.UNKNOWN, message: e.message });
            }
            console.error('[customer] unexpected error', e);
            callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
        }
    };
}

function startGrpcServer(customerService, port) {
    const definition = protoLoader.loadSync(path.join(process.env.PROTO_DIR, 'customer.proto'), {
        keepCase: false, // update_mask trong .proto -> updateMask trong JS
        defaults: true,
    });
    const pkg = grpc.loadPackageDefinition(definition).customer;

    const server = new grpc.Server();
    server.addService(pkg.CustomerService.service, {
        CreateCustomer: handle((req) => customerService.create(req)),
        GetCustomer: handle((req, caller) => customerService.get(req.uid, caller)),
        GetMembership: handle((req, caller) => customerService.getMembership(req.uid, caller)),
        UpdateCustomer: handle((req, caller) => customerService.update(req, caller)),
    });

    return new Promise((resolve, reject) => {
        server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
            if (err) return reject(err);
            console.log(`[customer] gRPC listening on :${port}`);
            resolve(server);
        });
    });
}

module.exports = { startGrpcServer };