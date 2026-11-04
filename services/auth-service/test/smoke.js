// Chạy TRONG container:  docker compose exec auth-service node test/smoke.js
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const definition = protoLoader.loadSync(path.join(process.env.PROTO_DIR, 'auth.proto'), {
    keepCase: false,
    defaults: true,
});
const { AuthService } = grpc.loadPackageDefinition(definition).auth;
const client = new AuthService('127.0.0.1:50051', grpc.credentials.createInsecure());

const call = (method, req) =>
    new Promise((resolve) => client[method](req, (err, res) => resolve({ err, res })));

const HTTP = { 3: '400', 6: '409', 16: '401' }; // gRPC -> HTTP (Gateway sẽ dịch)
let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? '  ->  ' + extra : ''}`);
    ok ? pass++ : fail++;
}
const decode = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

(async () => {
    const username = `trung`;
    const password = 'P@ss123';

    let r = await call('Register', { username, password, email: `${username}@example.com`, phone: '0900000000' });
    const uid = r.res && r.res.uid;
    check('TC-IAM-01 Đăng ký hợp lệ', !r.err && uid > 0, `uid=${uid} (HTTP 201)`);

    r = await call('Register', { username, password });
    check('TC-IAM-02 Trùng username', r.err && r.err.code === grpc.status.ALREADY_EXISTS, `HTTP ${HTTP[r.err && r.err.code]}`);

    r = await call('Register', { username: `${username}x`, password: '' });
    check('TC-IAM-03 Thiếu password', r.err && r.err.code === grpc.status.INVALID_ARGUMENT, `HTTP ${HTTP[r.err && r.err.code]}`);

    r = await call('Login', { username, password });
    const token = r.res && r.res.accessToken;
    check('TC-IAM-04 Đăng nhập đúng: có token', !r.err && !!token && r.res.tokenType === 'Bearer' && r.res.expiresIn === 3600,
        `tokenType=${r.res && r.res.tokenType}, expiresIn=${r.res && r.res.expiresIn}`);
    const payload = token ? decode(token) : {};
    check('TC-IAM-04 JWT có sub và role', payload.sub === String(uid) && payload.role === 'CUSTOMER',
        `sub=${payload.sub}, role=${payload.role}`);

    r = await call('Login', { username, password: 'sai-mat-khau' });
    check('TC-IAM-05 Sai password', r.err && r.err.code === grpc.status.UNAUTHENTICATED, `HTTP ${HTTP[r.err && r.err.code]}`);

    r = await call('Login', { username: '', password: '' });
    check('Đăng nhập thiếu dữ liệu', r.err && r.err.code === grpc.status.INVALID_ARGUMENT, `HTTP ${HTTP[r.err && r.err.code]}`);

    r = await call('VerifyToken', { token });
    check('VerifyToken: token hợp lệ', !r.err && r.res.valid === true && r.res.uid === uid && r.res.role === 'CUSTOMER',
        `valid=${r.res && r.res.valid}, uid=${r.res && r.res.uid}, role=${r.res && r.res.role}`);

    r = await call('VerifyToken', { token: 'khong.phai.jwt' });
    check('VerifyToken: token rác bị từ chối', !r.err && r.res.valid === false);

    r = await call('Login', { username: 'admin', password: process.env.ADMIN_PASSWORD });
    const adminCheck = r.res ? await call('VerifyToken', { token: r.res.accessToken }) : {};
    check('Tài khoản admin được seed, role = ADMIN', adminCheck.res && adminCheck.res.role === 'ADMIN',
        `role=${adminCheck.res && adminCheck.res.role}`);

    console.log(`\nKẾT QUẢ: ${pass} PASS, ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})();