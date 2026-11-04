const { validateRegistration, validateLogin } = require('../domain/user');
const { DomainError } = require('../domain/errors');

// userRepository, passwordHasher, tokenService được truyền từ ngoài vào (index.js).
// Lớp application chỉ biết "cần một thứ có hàm hash()", không biết đó là bcrypt hay gì khác.
function createAuthService({ userRepository, passwordHasher, tokenService }) {
    async function register(input) {
        validateRegistration(input);
        const passwordHash = await passwordHasher.hash(input.password);
        const uid = await userRepository.createCustomer({
            username: input.username.trim(),
            email: input.email || null,
            phone: input.phone || null,
            passwordHash,
        });
        return { uid };
    }

    async function login(input) {
        validateLogin(input);
        const user = await userRepository.findByUsername(input.username.trim());
        const ok = user && (await passwordHasher.compare(input.password, user.passwordHash));
        // Cùng một thông báo cho "sai username" và "sai password" để không lộ username nào tồn tại
        if (!ok) throw new DomainError('UNAUTHENTICATED', 'Invalid username or password');
        return tokenService.issue({ uid: user.uid, role: user.role });
    }

    function verifyToken(token) {
        return tokenService.verify(token);
    }

    return { register, login, verifyToken };
}

module.exports = { createAuthService };