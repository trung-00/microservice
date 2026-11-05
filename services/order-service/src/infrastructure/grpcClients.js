const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { DomainError } = require('../domain/errors');

const TIMEOUT_MS = Number(process.env.GRPC_TIMEOUT_MS || 3000);

function loadPackage(file, name) {
    const definition = protoLoader.loadSync(path.join(process.env.PROTO_DIR, file), {
        keepCase: false,
        defaults: true,
    });
    return grpc.loadPackageDefinition(definition)[name];
}

const credentials = grpc.credentials.createInsecure();
const customerClient = new (loadPackage('customer.proto', 'customer').CustomerService)(
    process.env.CUSTOMER_GRPC_URL,
    credentials
);
const productClient = new (loadPackage('product.proto', 'product').ProductService)(
    process.env.PRODUCT_GRPC_URL,
    credentials
);

// Mã lỗi gRPC của service bên dưới -> lỗi nghiệp vụ của Order Service.
// Lỗi lạ hoặc service không phản hồi đều thành UNAVAILABLE: đơn bị từ chối an toàn (UC06).
const DOMAIN_BY_GRPC = {
    3: 'INVALID_ARGUMENT',
    5: 'NOT_FOUND',
    7: 'PERMISSION_DENIED',
    9: 'FAILED_PRECONDITION',
};

function toDomainError(err) {
    const code = DOMAIN_BY_GRPC[err.code];
    if (code) return new DomainError(code, err.details || err.message);
    console.error('[order] downstream failure:', err.details || err.message);
    return new DomainError('UNAVAILABLE', 'A required service is temporarily unavailable');
}

// Gọi một hàm gRPC dưới dạng Promise, có deadline, và chuyển tiếp danh tính người gọi qua metadata.
function call(client, method, request, caller) {
    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        if (caller && caller.uid) {
            metadata.set('x-user-id', String(caller.uid));
            metadata.set('x-user-role', caller.role);
        }
        const deadline = new Date(Date.now() + TIMEOUT_MS);
        client[method](request, metadata, { deadline }, (err, res) => (err ? reject(toDomainError(err)) : resolve(res)));
    });
}

module.exports = { customerClient, productClient, call, toDomainError };