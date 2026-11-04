const pool = require('./db');

async function migrate() {
    // customer.uid KHÔNG phải SERIAL và KHÔNG có khóa ngoại: uid do Auth Service cấp,
    // nằm ở database khác (Database-per-Service), chỉ là tham chiếu logic.
    // membership.mid là dữ liệu tham chiếu cố định nên đặt số thẳng, không dùng SERIAL.
    await pool.query(`
    CREATE TABLE IF NOT EXISTS membership (
      mid   INT PRIMARY KEY,
      mname VARCHAR(50) UNIQUE NOT NULL,
      score INT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customer (
      uid      INT PRIMARY KEY,
      fullname VARCHAR(100) NOT NULL,
      mid      INT NOT NULL REFERENCES membership(mid)
    );
    INSERT INTO membership(mid, mname, score) VALUES
      (1, 'Bronze', 10),
      (2, 'Silver', 100),
      (3, 'Gold', 500)
    ON CONFLICT (mid) DO NOTHING;
  `);
}

module.exports = { migrate };