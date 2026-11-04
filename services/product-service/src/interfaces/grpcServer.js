const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { DomainError } = require('../domain/errors');

const STATUS = {
    INVALID_ARGUMENT: grpc.status.INVALID_ARGUMENT,
    NOT_FOUND: grpc.status.NOT_FOUND,
};

function handle(fn) {
    return async (call, callback) => {
        try {
            callback(null, await fn(call.request));
        } catch (e) {
            if (e instanceof DomainError) {
                return callback({ code: STATUS[e.code] ?? grpc.status.UNKNOWN, message: e.message });
            }
            console.error('[product] unexpected error', e);
            callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
        }
    };
}

// 3 hàm kho dành cho Order Service sẽ được làm ở Bước 5
const notYet = (call, callback) =>
    callback({ code: grpc.status.UNIMPLEMENTED, message: 'Not implemented yet (Step 5)' });

function startGrpcServer(productService, port) {
    const definition = protoLoader.loadSync(path.join(process.env.PROTO_DIR, 'product.proto'), {
        keepCase: false, // update_mask trong .proto -> updateMask trong JS
        defaults: true,
    });
    const pkg = grpc.loadPackageDefinition(definition).product;

    const server = new grpc.Server();
    server.addService(pkg.ProductService.service, {
        ListProducts: handle(async () => ({ items: await productService.list() })),
        GetProduct: handle((req) => productService.get(req.pid)),
        CreateProduct: handle((req) => productService.create(req)),
        UpdateProduct: handle((req) => productService.update(req)),
        DeleteProduct: handle((req) => productService.remove(req.pid)),
        CheckProducts: notYet,
        DecreaseStock: notYet,
        RestoreStock: notYet,
    });

    return new Promise((resolve, reject) => {
        server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
            if (err) return reject(err);
            console.log(`[product] gRPC listening on :${port}`);
            resolve(server);
        });
    });
}

module.exports = { startGrpcServer };