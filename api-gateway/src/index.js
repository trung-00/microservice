const express = require('express');
const config = require('./config');
const { authClient, customerClient, productClient, orderClient, shipmentClient, call } = require('./grpc-clients');
const { authenticate, authorize } = require('./middlewares/auth');
const { errorHandler } = require('./middlewares/errorHandler');
const { requestLogger } = require('./middlewares/requestLogger');
const { rateLimit } = require('./middlewares/rateLimit');
const { cacheResponse, invalidateOnSuccess } = require('./middlewares/cache');
const { withTokenCache } = require('./cache/tokenCache');
const { createRedis } = require('./redis/client');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const shipmentRoutes = require('./routes/shipments');

const redis = createRedis();
const app = express();
app.disable('x-powered-by');

// Thứ tự quan trọng: ghi log -> giới hạn tốc độ (từ chối sớm, trước cả khi đọc body) -> đọc JSON -> các route.
app.use(requestLogger());
app.use(rateLimit({ redis, name: 'global', ...config.rateLimit.global, skip: (req) => req.path === '/api/health' }));
app.use(express.json({ limit: '100kb' }));

// Xác thực = hỏi Auth Service qua gRPC (bước 2 của luồng đặt hàng), có cache kết quả trong Redis.
const verifyToken = withTokenCache((token) => call(authClient, 'VerifyToken', { token }), {
    redis,
    maxTtlSeconds: config.cache.tokenMaxSeconds,
});
const requireLogin = authenticate(verifyToken);
// Với các route đã được xác thực sẵn ở mức app.use bên dưới, bước xác thực bên trong router là không cần nữa.
const alreadyAuthenticated = (req, res, next) => next();

app.use('/api/health', healthRoutes());
app.use('/api/auth', rateLimit({ redis, name: 'auth', ...config.rateLimit.auth }), authRoutes({ call, authClient, customerClient }));
app.use('/api/customers', customerRoutes({ call, customerClient, authenticate: requireLogin }));

// Sản phẩm: xác thực -> cache các yêu cầu GET -> ghi thành công thì xóa cache sản phẩm.
app.use(
    '/api/products',
    requireLogin,
    cacheResponse({ redis, group: 'products', ttlSeconds: config.cache.ttlSeconds }),
    invalidateOnSuccess({ redis, groups: ['products'] }),
    productRoutes({ call, productClient, authenticate: alreadyAuthenticated, authorize })
);

// Đặt hàng thành công làm thay đổi tồn kho, nên cache sản phẩm cũng phải bị xóa.
app.use(
    '/api/orders',
    requireLogin,
    invalidateOnSuccess({ redis, groups: ['products'], methods: ['POST'] }),
    orderRoutes({ call, orderClient, shipmentClient, authenticate: alreadyAuthenticated })
);

app.use('/api/shipments', shipmentRoutes({ call, shipmentClient, authenticate: requireLogin, authorize }));

app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use(errorHandler);

app.listen(config.port, '0.0.0.0', () => console.log(`[gateway] listening on :${config.port}`));