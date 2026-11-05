const { DomainError } = require('./errors');

const checkName = (v) => (typeof v === 'string' && v.trim() !== '' ? null : 'pname is required');
const checkPrice = (v) => (Number.isFinite(v) && v >= 0 ? null : 'price must be a number >= 0');
const checkQuantity = (v) => (Number.isInteger(v) && v >= 0 ? null : 'quantity must be an integer >= 0');

const RULES = { pname: checkName, price: checkPrice, quantity: checkQuantity };

const INT32_MAX = 2147483647;
const MAX_STOCK_ITEMS = 50;
const isPositiveInt = (v) => Number.isInteger(v) && v >= 1 && v <= INT32_MAX;

function assertValid(problems) {
    const list = problems.filter(Boolean);
    if (list.length) throw new DomainError('INVALID_ARGUMENT', list.join('; '));
}

function validateNewProduct({ pname, price, quantity }) {
    assertValid([checkName(pname), checkPrice(price), checkQuantity(quantity)]);
}

// Cập nhật một phần: chỉ kiểm tra và áp dụng các field có trong updateMask.
function buildChanges(input, mask) {
    if (!mask || mask.length === 0) {
        throw new DomainError('INVALID_ARGUMENT', 'at least one of pname, price, quantity is required');
    }
    const unknown = mask.filter((f) => !(f in RULES));
    if (unknown.length) throw new DomainError('INVALID_ARGUMENT', `unknown field: ${unknown.join(', ')}`);

    assertValid(mask.map((f) => RULES[f](input[f])));

    const changes = {};
    for (const f of mask) changes[f] = f === 'pname' ? input[f].trim() : input[f];
    return changes;
}

// Kiểm tra yêu cầu kho của Order Service và gộp các dòng trùng pid.
function normalizeStockItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new DomainError('INVALID_ARGUMENT', 'items must not be empty');
    }
    if (items.length > MAX_STOCK_ITEMS) {
        throw new DomainError('INVALID_ARGUMENT', `at most ${MAX_STOCK_ITEMS} items per request`);
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

module.exports = { validateNewProduct, buildChanges, normalizeStockItems };