const { DomainError } = require('./errors');

// API Specification: PENDING, SHIPPING, DELIVERED, CANCELLED. Tài liệu không quy định thứ tự
// chuyển trạng thái nên cho phép chuyển sang bất kỳ trạng thái hợp lệ nào.
const STATUSES = ['PENDING', 'SHIPPING', 'DELIVERED', 'CANCELLED'];
const INT32_MAX = 2147483647;
const isPositiveInt = (v) => Number.isInteger(v) && v >= 1 && v <= INT32_MAX;

const isAdmin = (caller) => caller.role === 'ADMIN';
const isStaff = (caller) => caller.role === 'SHIPMENT_STAFF';
const isCustomer = (caller) => caller.role === 'CUSTOMER';

// Admin và nhân viên giao hàng xem được mọi vận đơn; khách chỉ xem được vận đơn của đơn hàng của mình.
function assertCanView(caller, shipment) {
    if (isAdmin(caller) || isStaff(caller)) return;
    if (isCustomer(caller) && shipment.uid !== 0 && shipment.uid === caller.uid) return;
    throw new DomainError('PERMISSION_DENIED', 'You can only access your own shipments');
}

function assertCanUpdate(caller) {
    if (isAdmin(caller) || isStaff(caller)) return;
    throw new DomainError('PERMISSION_DENIED', 'Only shipment staff or admin can update shipments');
}

function validateStatus(status) {
    if (typeof status !== 'string' || !STATUSES.includes(status)) {
        throw new DomainError('INVALID_ARGUMENT', `Invalid status (allowed: ${STATUSES.join(', ')})`);
    }
    return status;
}

// Đọc sự kiện OrderCreated. Chấp nhận cả dạng đầy đủ { eventType, data: { oid, uid, ... } }
// lẫn dạng phẳng { oid, uid, ... } (như hình Business Process Model), để dễ thử bằng tay.
// Bắt buộc có oid. uid không bắt buộc: thiếu thì vận đơn chỉ Admin/nhân viên xem được.
function parseOrderCreatedEvent(text) {
    let msg;
    try {
        msg = JSON.parse(text);
    } catch {
        return { ok: false, reason: 'invalid JSON' };
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
        return { ok: false, reason: 'event must be a JSON object' };
    }
    if (msg.eventType !== undefined && msg.eventType !== 'OrderCreated') {
        return { ok: false, reason: `unexpected eventType: ${String(msg.eventType)}` };
    }
    const data = msg.data !== undefined ? msg.data : msg;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, reason: 'event data must be an object' };
    }
    if (!isPositiveInt(data.oid)) return { ok: false, reason: 'oid is missing or invalid' };
    if (data.uid !== undefined && !isPositiveInt(data.uid)) return { ok: false, reason: 'uid is invalid' };
    return { ok: true, oid: data.oid, uid: data.uid === undefined ? 0 : data.uid };
}

module.exports = { STATUSES, assertCanView, assertCanUpdate, validateStatus, parseOrderCreatedEvent };