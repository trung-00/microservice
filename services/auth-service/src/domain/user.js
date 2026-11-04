const { DomainError } = require('./errors');

const MIN_PASSWORD_LENGTH = 3; // chỉ để demo/học tập; hệ thống thật nên đặt từ 8 trở lên

function validateRegistration({ username, password, email }) {
    const problems = [];
    if (!username || username.trim().length < 3) problems.push('username must be at least 3 characters');
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        problems.push(`password is required (min ${MIN_PASSWORD_LENGTH} characters)`);
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) problems.push('email is invalid');
    if (problems.length) throw new DomainError('INVALID_ARGUMENT', problems.join('; '));
}

function validateLogin({ username, password }) {
    if (!username || !password) {
        throw new DomainError('INVALID_ARGUMENT', 'username and password are required');
    }
}

module.exports = { validateRegistration, validateLogin };