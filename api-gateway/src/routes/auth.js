const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');

// Không phải chuỗi thì coi như rỗng; Auth Service sẽ trả 400 vì thiếu dữ liệu.
const str = (v) => (typeof v === 'string' ? v : '');

module.exports = function authRoutes({ call, authClient, customerClient }) {
    const router = express.Router();

    // Bảo đảm tài khoản CUSTOMER nào cũng có hồ sơ Customer (idempotent: gọi lại không sao).
    // Lỗi ở đây chỉ được ghi log, không làm hỏng việc đăng ký/đăng nhập đã thành công.
    async function ensureCustomerProfile(uid, fullname) {
        try {
            await call(customerClient, 'CreateCustomer', { uid, fullname });
        } catch (e) {
            console.error(`[gateway] could not ensure customer profile for uid ${uid}: ${e.details || e.message}`);
        }
    }

    router.post('/register', asyncHandler(async (req, res) => {
        const { username, password, email, phone, fullname } = req.body || {};
        const out = await call(authClient, 'Register', {
            username: str(username), password: str(password), email: str(email), phone: str(phone),
        });
        await ensureCustomerProfile(out.uid, str(fullname).trim() || str(username).trim());
        res.status(201).json({ message: 'User registered successfully', uid: out.uid });
    }));

    router.post('/login', asyncHandler(async (req, res) => {
        const { username, password } = req.body || {};
        const out = await call(authClient, 'Login', { username: str(username), password: str(password) });

        // Tài khoản đăng ký từ trước Bước 4 chưa có hồ sơ: bổ sung ở lần đăng nhập đầu tiên.
        try {
            const who = await call(authClient, 'VerifyToken', { token: out.accessToken });
            if (who.valid && who.role === 'CUSTOMER') await ensureCustomerProfile(who.uid, str(username).trim());
        } catch (e) {
            console.error('[gateway] skipped customer profile check:', e.details || e.message);
        }

        res.status(200).json({ accessToken: out.accessToken, tokenType: out.tokenType, expiresIn: out.expiresIn });
    }));

    return router;
};