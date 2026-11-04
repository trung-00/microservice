const express = require('express');
const config = require('./config');
const { authClient, customerClient, productClient, call } = require('./grpc-clients');
const { authenticate, authorize } = require('./middlewares/auth');
const { errorHandler } = require('./middlewares/errorHandler');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Xác thực = hỏi Auth Service qua gRPC (bước 2 của luồng đặt hàng)
const verifyToken = (token) => call(authClient, 'VerifyToken', { token });
const requireLogin = authenticate(verifyToken);

app.use('/api/health', healthRoutes());
app.use('/api/auth', authRoutes({ call, authClient, customerClient }));
app.use('/api/customers', customerRoutes({ call, customerClient, authenticate: requireLogin }));
app.use('/api/products', productRoutes({ call, productClient, authenticate: requireLogin, authorize }));

app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use(errorHandler);

app.listen(config.port, '0.0.0.0', () => console.log(`[gateway] listening on :${config.port}`));