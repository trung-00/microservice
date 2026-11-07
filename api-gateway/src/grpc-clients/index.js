const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const config = require('../config');

function loadPackage(file, name) {
    const definition = protoLoader.loadSync(path.join(config.protoDir, file), {
        keepCase: false,
        defaults: true,
    });
    return grpc.loadPackageDefinition(definition)[name];
}

const credentials = grpc.credentials.createInsecure();
const authClient = new (loadPackage('auth.proto', 'auth').AuthService)(config.authUrl, credentials);
const customerClient = new (loadPackage('customer.proto', 'customer').CustomerService)(config.customerUrl, credentials);
const productClient = new (loadPackage('product.proto', 'product').ProductService)(config.productUrl, credentials);
const orderClient = new (loadPackage('order.proto', 'order').OrderService)(config.orderUrl, credentials);
const shipmentClient = new (loadPackage('shipment.proto', 'shipment').ShipmentService)(config.shipmentUrl, credentials);

// Gọi một hàm gRPC dưới dạng Promise: có deadline, và gắn danh tính người dùng vào metadata.
// timeoutMs: thời gian chờ tối đa, mặc định lấy từ cấu hình.
function call(client, method, request, user, timeoutMs = config.grpcTimeoutMs) {
    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        if (user) {
            metadata.set('x-user-id', String(user.uid));
            metadata.set('x-user-role', user.role);
        }
        const deadline = new Date(Date.now() + timeoutMs);
        client[method](request, metadata, { deadline }, (err, res) => (err ? reject(err) : resolve(res)));
    });
}

module.exports = { authClient, customerClient, productClient, orderClient, shipmentClient, call };