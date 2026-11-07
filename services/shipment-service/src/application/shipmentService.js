const { assertCanView, assertCanUpdate, validateStatus, parseOrderCreatedEvent } = require('../domain/shipment');
const { DomainError } = require('../domain/errors');

const notFound = () => new DomainError('NOT_FOUND', 'Shipment not found');

// shipmentRepository và deadLetter được truyền từ ngoài vào (index.js)
function createShipmentService({ shipmentRepository, deadLetter, logger = console }) {
    async function get(shipid, caller) {
        const shipment = await shipmentRepository.findByShipid(shipid);
        if (!shipment) throw notFound();
        assertCanView(caller, shipment);
        return shipment;
    }

    // Khách chỉ biết mã đơn hàng (oid), không biết shipid, nên cần tra theo oid.
    async function getByOrder(oid, caller) {
        const shipment = await shipmentRepository.findByOid(oid);
        if (!shipment) throw notFound();
        assertCanView(caller, shipment);
        return shipment;
    }

    // UC11: kiểm tra vai trò -> kiểm tra trạng thái -> cập nhật -> 404 nếu không có vận đơn.
    async function updateStatus({ shipid, status }, caller) {
        assertCanUpdate(caller);
        const valid = validateStatus(status);
        const updated = await shipmentRepository.updateStatus(shipid, valid);
        if (!updated) throw notFound();
        return updated;
    }

    // Xử lý một sự kiện OrderCreated lấy từ Kafka (TC-SHP-01, 02, 05).
    // Kafka giao "ít nhất một lần" nên cùng một sự kiện có thể đến nhiều lần: phải idempotent.
    async function handleOrderCreated(text, meta = {}) {
        const parsed = parseOrderCreatedEvent(text);
        if (!parsed.ok) {
            logger.error(`[shipment] rejected event (${parsed.reason}) at ${meta.topic}[${meta.partition}]@${meta.offset}`);
            await deadLetter.send(text, parsed.reason, meta); // lỗi này được ghi nhận, vận đơn KHÔNG được tạo
            return { created: false, rejected: true, reason: parsed.reason };
        }
        if (parsed.uid === 0) logger.warn(`[shipment] event for order ${parsed.oid} has no uid; only admin/staff can view it`);

        const { shipment, created } = await shipmentRepository.createIfAbsent({
            oid: parsed.oid,
            uid: parsed.uid,
            status: 'PENDING',
        });
        if (created) logger.log(`[shipment] created shipment ${shipment.shipid} for order ${shipment.oid}`);
        else logger.log(`[shipment] duplicate event for order ${parsed.oid} ignored (shipment ${shipment.shipid} exists)`);
        return { created, rejected: false, shipment };
    }

    return { get, getByOrder, updateStatus, handleOrderCreated };
}

module.exports = { createShipmentService };