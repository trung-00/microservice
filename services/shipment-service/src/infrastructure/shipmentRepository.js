const { getDb } = require('./mongo');

const shipments = () => getDb().collection('shipments');
const toShipment = (d) => ({ shipid: d.shipid, oid: d.oid, status: d.status, uid: d.uid || 0 });

// Chạy một lần lúc khởi động.
async function init() {
    // Unique index trên oid là chốt chặn thật sự chống tạo vận đơn trùng (TC-SHP-05).
    await shipments().createIndex({ oid: 1 }, { unique: true });
    await shipments().createIndex({ shipid: 1 }, { unique: true });
    // ERD quy định shipid là INT; MongoDB không tự tăng nên dùng bộ đếm riêng. Bắt đầu từ 5001 như ví dụ của API.
    await getDb().collection('counters').updateOne({ _id: 'shipment' }, { $setOnInsert: { seq: 5000 } }, { upsert: true });
}

async function nextShipid() {
    const doc = await getDb()
        .collection('counters')
        .findOneAndUpdate({ _id: 'shipment' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
    return doc.seq;
}

async function findByShipid(shipid) {
    const doc = await shipments().findOne({ shipid });
    return doc ? toShipment(doc) : null;
}

async function findByOid(oid) {
    const doc = await shipments().findOne({ oid });
    return doc ? toShipment(doc) : null;
}

// Trả về { shipment, created }. created = false nghĩa là đơn này đã có vận đơn từ trước.
async function createIfAbsent({ oid, uid, status }) {
    const existing = await shipments().findOne({ oid });
    if (existing) return { shipment: toShipment(existing), created: false };

    const shipid = await nextShipid();
    const now = new Date();
    try {
        await shipments().insertOne({ shipid, oid, uid, status, createdAt: now, updatedAt: now });
        return { shipment: { shipid, oid, status, uid }, created: true };
    } catch (e) {
        // 11000 = trùng khóa: hai sự kiện giống nhau được xử lý cùng lúc, bên kia đã tạo trước.
        if (e.code === 11000) {
            const again = await shipments().findOne({ oid });
            if (again) return { shipment: toShipment(again), created: false };
        }
        throw e;
    }
}

async function updateStatus(shipid, status) {
    const doc = await shipments().findOneAndUpdate(
        { shipid },
        { $set: { status, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return doc ? toShipment(doc) : null;
}

module.exports = { init, findByShipid, findByOid, createIfAbsent, updateStatus };