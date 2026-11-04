const { DomainError } = require('./errors');

const checkName = (v) => (typeof v === 'string' && v.trim() !== '' ? null : 'pname is required');
const checkPrice = (v) => (Number.isFinite(v) && v >= 0 ? null : 'price must be a number >= 0');
const checkQuantity = (v) => (Number.isInteger(v) && v >= 0 ? null : 'quantity must be an integer >= 0');

const RULES = { pname: checkName, price: checkPrice, quantity: checkQuantity };

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

module.exports = { validateNewProduct, buildChanges };