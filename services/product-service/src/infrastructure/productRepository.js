const { getDb } = require('./mongo');

const products = () => getDb().collection('products');
const toProduct = (d) => ({ pid: d.pid, pname: d.pname, price: d.price, quantity: d.quantity });

// ERD quy định pid là INT. MongoDB không tự tăng số nguyên nên dùng bộ đếm riêng.
async function nextPid() {
    const doc = await getDb()
        .collection('counters')
        .findOneAndUpdate({ _id: 'product' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
    return doc.seq;
}

async function insert({ pname, price, quantity }) {
    const pid = await nextPid();
    await products().insertOne({ pid, pname, price, quantity });
    return { pid, pname, price, quantity };
}

async function findAll() {
    const docs = await products().find({}).sort({ pid: 1 }).toArray();
    return docs.map(toProduct);
}

async function findByPid(pid) {
    const doc = await products().findOne({ pid });
    return doc ? toProduct(doc) : null;
}

async function updateByPid(pid, changes) {
    const doc = await products().findOneAndUpdate({ pid }, { $set: changes }, { returnDocument: 'after' });
    return doc ? toProduct(doc) : null;
}

async function deleteByPid(pid) {
    const r = await products().deleteOne({ pid });
    return r.deletedCount === 1;
}

async function count() {
    return products().countDocuments();
}

module.exports = { insert, findAll, findByPid, updateByPid, deleteByPid, count };