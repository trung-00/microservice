const jwt = require('jsonwebtoken');

const EXPIRES_IN = 3600; // giây

function issue({ uid, role }) {
    const accessToken = jwt.sign({ sub: String(uid), role }, process.env.JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: EXPIRES_IN,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn: EXPIRES_IN };
}

function verify(token) {
    try {
        const p = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        return { valid: true, uid: Number(p.sub), role: p.role };
    } catch {
        return { valid: false, uid: 0, role: '' };
    }
}

module.exports = { issue, verify };