const repo = require('./productRepository');

const SAMPLE = [
    { pname: 'Laptop', price: 1500, quantity: 10 },
    { pname: 'Smartphone', price: 800, quantity: 25 },
    { pname: 'Headphones', price: 120, quantity: 50 },
    { pname: 'Keyboard', price: 60, quantity: 100 },
    { pname: 'Monitor', price: 300, quantity: 15 },
];

// Chỉ nạp dữ liệu mẫu khi collection còn trống, để chạy lại nhiều lần không bị trùng.
async function seedIfEmpty() {
    if ((await repo.count()) > 0) return 0;
    for (const p of SAMPLE) await repo.insert(p);
    return SAMPLE.length;
}

module.exports = { seedIfEmpty };