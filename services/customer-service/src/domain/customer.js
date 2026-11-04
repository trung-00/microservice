const { DomainError } = require('./errors');

const UPDATABLE = ['fullname', 'mid'];
const isAdmin = (caller) => caller.role === 'ADMIN';

// ADMIN xem được mọi khách hàng; CUSTOMER chỉ xem được chính mình.
function assertCanAccess(caller, uid) {
    if (isAdmin(caller)) return;
    if (caller.role === 'CUSTOMER' && caller.uid === uid) return;
    throw new DomainError('PERMISSION_DENIED', 'You can only access your own customer data');
}

function cleanFullname(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) throw new DomainError('INVALID_ARGUMENT', 'fullname is required');
    if (name.length > 100) throw new DomainError('INVALID_ARGUMENT', 'fullname must be at most 100 characters');
    return name;
}

function validateNewCustomer({ uid, fullname }) {
    if (!Number.isInteger(uid) || uid < 1) throw new DomainError('INVALID_ARGUMENT', 'uid must be a positive integer');
    return { uid, fullname: cleanFullname(fullname) };
}

// Cập nhật một phần: chỉ xử lý các field có trong updateMask.
function buildChanges(caller, input, mask) {
    if (!mask || mask.length === 0) {
        throw new DomainError('INVALID_ARGUMENT', 'at least one of fullname, mid is required');
    }
    const unknown = mask.filter((f) => !UPDATABLE.includes(f));
    if (unknown.length) throw new DomainError('INVALID_ARGUMENT', `unknown field: ${unknown.join(', ')}`);

    assertCanAccess(caller, input.uid); // sai chủ sở hữu -> 403 trước khi nói chuyện dữ liệu
    if (mask.includes('mid') && !isAdmin(caller)) {
        throw new DomainError('PERMISSION_DENIED', 'Only admin can change membership');
    }

    const changes = {};
    if (mask.includes('fullname')) changes.fullname = cleanFullname(input.fullname);
    if (mask.includes('mid')) {
        if (!Number.isInteger(input.mid) || input.mid < 1) {
            throw new DomainError('INVALID_ARGUMENT', 'mid must be a positive integer');
        }
        changes.mid = input.mid;
    }
    return changes;
}

module.exports = { assertCanAccess, validateNewCustomer, buildChanges };