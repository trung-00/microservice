const bcrypt = require('bcryptjs');
const pool = require('./db');

// Đăng ký công khai chỉ tạo CUSTOMER, nên ADMIN và SHIPMENT_STAFF phải được seed sẵn.
// Kiểm tra tồn tại trước khi băm mật khẩu: tài khoản đã có thì không làm gì (cũng không tốn số uid).
async function seedUser(username, password, roleName) {
  const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (exists.rowCount) return;

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users(username, password, roleid)
     VALUES ($1, $2, (SELECT roleid FROM role WHERE rolename = $3))
     ON CONFLICT (username) DO NOTHING`,
    [username, hash, roleName]
  );
}

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

  await seedUser('admin', process.env.ADMIN_PASSWORD, 'ADMIN');
  // Tài khoản nhân viên giao hàng (UC11). Mật khẩu: STAFF_PASSWORD nếu có, không thì dùng ADMIN_PASSWORD.
  await seedUser('staff', process.env.STAFF_PASSWORD || process.env.ADMIN_PASSWORD, 'SHIPMENT_STAFF');
}

module.exports = { migrate };