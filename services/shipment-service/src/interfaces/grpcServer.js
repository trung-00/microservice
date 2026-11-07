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
            console.error('[shipment] unexpected error', e);
            callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
        }
    };
}

// Vận đơn KHÔNG có hàm tạo: nó được tạo khi nhận sự kiện OrderCreated từ Kafka.
function startGrpcServer(shipmentService, port) {
    const definition = protoLoader.loadSync(path.join(process.env.PROTO_DIR, 'shipment.proto'), {
        keepCase: false,
        defaults: true,
    });
    const pkg = grpc.loadPackageDefinition(definition).shipment;

    const server = new grpc.Server();
    server.addService(pkg.ShipmentService.service, {
        GetShipment: handle((req, caller) => shipmentService.get(req.shipid, caller)),
        GetShipmentByOrder: handle((req, caller) => shipmentService.getByOrder(req.oid, caller)),
        UpdateShipmentStatus: handle((req, caller) => shipmentService.updateStatus(req, caller)),
    });

    return new Promise((resolve, reject) => {
        server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
            if (err) return reject(err);
            console.log(`[shipment] gRPC listening on :${port}`);
            resolve(server);
        });
    });
}

module.exports = { startGrpcServer };