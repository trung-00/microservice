const crypto = require('crypto');
const pool = require('./db');
const { orderCreatedEvent } = require('../domain/order');

// NUMERIC trả về dạng chuỗi, đổi sang số cho gRPC.
const toItem = (r) => ({ pid: r.pid, qty: r.qty, unitPrice: Number(r.unit_price) });
const toOrder = (r, items = []) => ({
    oid: r.oid,
    uid: r.uid,
    discount: Number(r.discount),
    totalAmount: Number(r.total_amount),
    items,
    shipmentStatus: '',
});

// Order + OrderDetail + OutboxEvent trong CÙNG một giao dịch: hoặc có cả ba, hoặc không có gì.
async function save(order) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const o = await client.query(
            'INSERT INTO orders(uid, discount, total_amount) VALUES ($1, $2, $3) RETURNING oid',
            [order.uid, order.discount, order.totalAmount]
        );
        const { oid } = o.rows[0];

        for (const it of order.items) {
            await client.query(
                'INSERT INTO order_detail(oid, pid, qty, unit_price) VALUES ($1, $2, $3, $4)',
                [oid, it.pid, it.qty, it.unitPrice]
            );
        }

        const event = orderCreatedEvent({ ...order, oid }, { id: crypto.randomUUID(), now: new Date().toISOString() });
        await client.query(
            'INSERT INTO outbox_event(id, aggregate_id, event_type, payload) VALUES ($1, $2, $3, $4)',
            [event.eventId, oid, event.eventType, JSON.stringify(event)]
        );

        await client.query('COMMIT');
        return { ...order, oid };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    } finally {
        client.release();
    }
}

async function findById(oid) {
    const o = await pool.query('SELECT oid, uid, discount, total_amount FROM orders WHERE oid = $1', [oid]);
    if (!o.rows[0]) return null;
    const d = await pool.query('SELECT pid, qty, unit_price FROM order_detail WHERE oid = $1 ORDER BY pid', [oid]);
    return toOrder(o.rows[0], d.rows.map(toItem));
}

// uid = 0: tất cả đơn. Tối đa 100 đơn mới nhất (API Specification: phân trang sẽ bổ sung sau).
async function listByUid(uid) {
    const r =
        uid === 0
            ? await pool.query('SELECT oid, uid, discount, total_amount FROM orders ORDER BY oid DESC LIMIT 100')
            : await pool.query(
                'SELECT oid, uid, discount, total_amount FROM orders WHERE uid = $1 ORDER BY oid DESC LIMIT 100',
                [uid]
            );
    return r.rows.map((row) => toOrder(row));
}

module.exports = { save, findById, listByUid };