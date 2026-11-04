const pool = require('./db');
const { DomainError } = require('../domain/errors');

const COLUMNS = ['fullname', 'mid']; // danh sách cột được phép sửa

async function findByUid(uid) {
    const r = await pool.query('SELECT uid, fullname, mid FROM customer WHERE uid = $1', [uid]);
    return r.rows[0] || null;
}

// Khách mới mặc định hạng Bronze. ON CONFLICT: gọi lại không ghi đè dữ liệu có sẵn.
async function createIfAbsent({ uid, fullname }) {
    await pool.query(
        `INSERT INTO customer(uid, fullname, mid)
     VALUES ($1, $2, (SELECT mid FROM membership WHERE mname = 'Bronze'))
     ON CONFLICT (uid) DO NOTHING`,
        [uid, fullname]
    );
    return findByUid(uid);
}

async function findMembershipByUid(uid) {
    const r = await pool.query(
        `SELECT m.mid, m.mname, m.score
       FROM customer c JOIN membership m ON m.mid = c.mid
      WHERE c.uid = $1`,
        [uid]
    );
    return r.rows[0] || null;
}

async function updateByUid(uid, changes) {
    const keys = Object.keys(changes).filter((k) => COLUMNS.includes(k));
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    try {
        const r = await pool.query(
            `UPDATE customer SET ${sets} WHERE uid = $${keys.length + 1} RETURNING uid, fullname, mid`,
            [...keys.map((k) => changes[k]), uid]
        );
        return r.rows[0] || null;
    } catch (e) {
        // 23503 = khóa ngoại: mid không tồn tại trong bảng membership
        if (e.code === '23503') throw new DomainError('INVALID_ARGUMENT', 'Membership does not exist');
        throw e;
    }
}

module.exports = { findByUid, createIfAbsent, findMembershipByUid, updateByUid };