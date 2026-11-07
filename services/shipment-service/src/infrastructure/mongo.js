const { MongoClient } = require('mongodb');

let db;

async function connect(url) {
    const client = new MongoClient(url);
    await client.connect();
    db = client.db(); // tên database lấy từ chuỗi kết nối (shipment_db)
}

function getDb() {
    if (!db) throw new Error('MongoDB is not connected');
    return db;
}

async function ping() {
    await getDb().command({ ping: 1 });
}

module.exports = { connect, getDb, ping };