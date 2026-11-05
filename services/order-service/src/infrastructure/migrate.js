const pool = require('./db');

async function migrate() {
    // Bảng tên "orders" vì "order" là từ khóa dành riêng của SQL.
    // orders.uid và order_detail.pid KHÔNG có khóa ngoại: chúng trỏ sang DB của service khác.
    // orders.total_amount: bổ sung so với ERD (hình Business Process Model trả total_amount).
    // outbox_event: bảng Outbox của UC09, được ghi cùng giao dịch với Order.
    await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      oid          SERIAL PRIMARY KEY,
      uid          INT NOT NULL,
      discount     NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(10,2) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_detail (
      oid        INT NOT NULL REFERENCES orders(oid),
      pid        INT NOT NULL,
      qty        INT NOT NULL CHECK (qty > 0),
      unit_price NUMERIC(10,2) NOT NULL,
      PRIMARY KEY (oid, pid)
    );
    CREATE TABLE IF NOT EXISTS outbox_event (
      id           UUID PRIMARY KEY,
      aggregate_id INT NOT NULL,
      event_type   VARCHAR(50) NOT NULL,
      payload      JSONB NOT NULL,
      status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_orders_uid ON orders(uid);
    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_event(created_at) WHERE status = 'PENDING';
  `);
}

module.exports = { migrate };