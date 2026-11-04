const pool = require('./db');
const { DomainError } = require('../domain/errors');

async function createCustomer({ username, email, phone, passwordHash }) {
    try {
        const r = await pool.query(
            `INSERT INTO users(username, email, phone, password, roleid)
       VALUES ($1, $2, $3, $4, (SELECT roleid FROM role WHERE rolename = 'CUSTOMER'))
       RETURNING uid`,
            [username, email, phone, passwordHash]
        );
        return r.rows[0].uid;
    } catch (e) {
        // 23505 = vi phạm UNIQUE (trùng username hoặc email)
        if (e.code === '23505') throw new DomainError('ALREADY_EXISTS', 'Username or email already exists');
        throw e;
    }
}

async function findByUsername(username) {
    const r = await pool.query(
        `SELECT u.uid, u.password AS "passwordHash", r.rolename AS role
       FROM users u JOIN role r ON r.roleid = u.roleid
      WHERE u.username = $1`,
        [username]
    );
    return r.rows[0] || null;
}

module.exports = { createCustomer, findByUsername };