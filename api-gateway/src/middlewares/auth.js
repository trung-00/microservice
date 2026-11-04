const { HttpError } = require('../errors');

// verifyToken: hàm async (token) => { valid, uid, role }. Ở đây là lời gọi gRPC AuthService.VerifyToken.
function authenticate(verifyToken) {
    return async (req, res, next) => {
        try {
            const [scheme, token] = (req.headers.authorization || '').split(' ');
            if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
                throw new HttpError(401, 'Missing or invalid token');
            }
            const result = await verifyToken(token);
            if (!result.valid) throw new HttpError(401, 'Missing or invalid token');
            req.user = { uid: result.uid, role: result.role };
            next();
        } catch (e) {
            next(e);
        }
    };
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'Forbidden'));
        next();
    };
}

module.exports = { authenticate, authorize };