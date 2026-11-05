const { DomainError } = require('./errors');

const INT32_MAX = 2147483647;
const MAX_ITEMS = 50;
const MAX_TOTAL_CENTS = 9999999999; // cột NUMERIC(10,2): tối đa 99.999.999,99
const isPositiveInt = (v) => Number.isInteger(v) && v >= 1 && v <= INT32_MAX;

// Tính bằng "xu" (số nguyên) để tránh sai số số thực, ví dụ 0.1 + 0.2.
const toCents = (amount) => Math.round(amount * 100);
const fromCents = (cents) => cents / 100;

// Kiểm tra danh sách hàng khách đặt và gộp các dòng trùng pid.
function normalizeItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new DomainError('INVALID_ARGUMENT', 'items must not be empty');
    }
    if (items.length > MAX_ITEMS) {
        throw new DomainError('INVALID_ARGUMENT', `at most ${MAX_ITEMS} items per order`);
    }
    const merged = new Map();
    for (const it of items) {
        if (!it || !isPositiveInt(it.pid) || !isPositiveInt(it.qty)) {
            throw new DomainError('INVALID_ARGUMENT', 'each item needs a positive integer pid and qty');
        }
        const total = (merged.get(it.pid) || 0) + it.qty;
        if (total > INT32_MAX) throw new DomainError('INVALID_ARGUMENT', 'qty is too large');
        merged.set(it.pid, total);
    }
    return [...merged].map(([pid, qty]) => ({ pid, qty }));
}

// products: [{ pid, price }] lấy từ Product Service. Khách không được tự khai giá.
function buildOrder({ uid, items, products, percent }) {
    const priceOf = new Map(products.map((p) => [p.pid, p.price]));
    const lines = items.map(({ pid, qty }) => {
        if (!priceOf.has(pid)) throw new DomainError('NOT_FOUND', `Product not found: pid ${pid}`);
        return { pid, qty, unitPrice: priceOf.get(pid) };
    });

    const subtotalCents = lines.reduce((sum, l) => sum + toCents(l.unitPrice) * l.qty, 0);
    if (subtotalCents > MAX_TOTAL_CENTS) throw new DomainError('INVALID_ARGUMENT', 'Order total is too large');

    const discountCents = Math.round((subtotalCents * percent) / 100);
    return {
        uid,
        items: lines,
        subtotal: fromCents(subtotalCents),
        discount: fromCents(discountCents),
        totalAmount: fromCents(subtotalCents - discountCents),
    };
}

// Nội dung sự kiện ghi vào bảng Outbox. id và now do bên ngoài truyền vào để domain luôn thuần.
function orderCreatedEvent(order, { id, now }) {
    return {
        eventId: id,
        eventType: 'OrderCreated',
        occurredAt: now,
        data: {
            oid: order.oid,
            uid: order.uid,
            discount: order.discount,
            totalAmount: order.totalAmount,
            items: order.items.map((i) => ({ pid: i.pid, qty: i.qty, unitPrice: i.unitPrice })),
        },
    };
}

module.exports = { normalizeItems, buildOrder, orderCreatedEvent };