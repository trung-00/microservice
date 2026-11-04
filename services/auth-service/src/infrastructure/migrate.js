const bcrypt = require('bcryptjs');
const pool = require('./db');

async function migrate() {
  // Bảng tên "users" vì "user" là từ khóa dành riêng của PostgreSQL.
  // email, phone: bổ sung so với ERD vì API-AUTH-01 yêu cầu.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS role (
      roleid   SERIAL PRIMARY KEY,
      rolename VARCHAR(50) UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      uid      SERIAL PRIMARY KEY,
      username VARCHAR(50)  UNIQUE NOT NULL,
      email    VARCHAR(100) UNIQUE,
      phone    VARCHAR(20),
      password VARCHAR(255) NOT NULL,
      roleid   INT NOT NULL REFERENCES role(roleid)
    );
    INSERT INTO role(rolename) VALUES ('CUSTOMER'), ('ADMIN'), ('SHIPMENT_STAFF')
    ON CONFLICT (rolename) DO NOTHING;
  `);

  // Đăng ký công khai chỉ tạo CUSTOMER, nên ADMIN phải được seed sẵn.
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users(username, password, roleid)
     SELECT 'admin', $1, (SELECT roleid FROM role WHERE rolename = 'ADMIN')
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [hash]
  );
}

module.exports = { migrate };