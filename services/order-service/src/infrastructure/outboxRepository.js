const pool = require('./db');

// Lấy một lô sự kiện PENDING, đưa cho handler gửi đi, rồi đánh dấu PUBLISHED, tất cả trong MỘT giao dịch.
// - handler ném lỗi (Kafka sập): ROLLBACK, sự kiện vẫn PENDING và sẽ được thử lại (UC09).
// - FOR UPDATE SKIP LOCKED: nhiều bản Order Service chạy song song sẽ không lấy trùng một sự kiện.
// Nếu tiến trình chết đúng giữa lúc gửi xong và COMMIT thì sự kiện được gửi lại lần sau:
// Kafka giao "ít nhất một lần", nên bên nhận (Shipment Service) phải idempotent.
async function processPending(limit, handler) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query(
            `SELECT id, aggregate_id, event_type, payload
         FROM outbox_event
        WHERE status = 'PENDING'
        ORDER BY created_at, id
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
            [limit]
        );
        if (r.rows.length === 0) {
            await client.query('COMMIT');
            return 0;
        }

        await handler(r.rows);

        await client.query(
            `UPDATE outbox_event SET status = 'PUBLISHED', published_at = now() WHERE id = ANY($1::uuid[])`,
            [r.rows.map((row) => row.id)]
        );
        await client.query('COMMIT');
        return r.rows.length;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    } finally {
        client.release();
    }
}

module.exports = { processPending };