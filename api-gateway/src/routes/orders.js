const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const { HttpError } = require('../errors');

const INT32_MAX = 2147483647;
const CREATE_TIMEOUT_MS = 8000; // đặt hàng đi qua nhiều service nên cho thời gian chờ dài hơn mặc định

const isInt32 = (v) => Number.isInteger(v) && Math.abs(v) <= INT32_MAX;

function parseId(raw, name) {
    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > INT32_MAX) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return Number(raw);
}

// Gateway chỉ kiểm tra "hình dạng" dữ liệu. Luật nghiệp vụ (qty > 0, tối đa 50 dòng...) do Order Service kiểm tra.
function parseItems(body) {
    const items = body && body.items;
    const ok = Array.isArray(items) && items.length > 0 && items.every((it) => it && isInt32(it.pid) && isInt32(it.qty));
    if (!ok) throw new HttpError(400, 'items must be a non-empty array of {pid, qty} with integer values');
    return items.map(({ pid, qty }) => ({ pid, qty }));
}

// Đổi tên trường sang đúng dạng trong API Specification (unit_price, total_amount).
const presentSummary = (o) => ({ oid: o.oid, uid: o.uid, discount: o.discount, total_amount: o.totalAmount });
const presentOrder = (o) => ({
    ...presentSummary(o),
    items: o.items.map((i) => ({ pid: i.pid, qty: i.qty, unit_price: i.unitPrice })),
});
const presentShipment = (s) => ({ shipid: s.shipid, oid: s.oid, status: s.status });

module.exports = function orderRoutes({ call, orderClient, shipmentClient, authenticate }) {
    const router = express.Router();
    router.use(authenticate); // mọi route đơn hàng đều cần JWT (TC-ORD-02)

    router.post('/', asyncHandler(async (req, res) => {
        const items = parseItems(req.body);
        const out = await call(orderClient, 'CreateOrder', { uid: req.user.uid, items }, req.user, CREATE_TIMEOUT_MS);
        // Shipment được tạo bất đồng bộ qua Kafka nên lúc này chưa có shipid, chỉ có trạng thái ban đầu.
        res.status(201).json({ ...presentOrder(out), shipment: { status: out.shipmentStatus } });
    }));

    // Khách: đơn của mình. Admin: tất cả đơn, hoặc lọc bằng ?uid=
    router.get('/', asyncHandler(async (req, res) => {
        const isAdmin = req.user.role === 'ADMIN';
        const uid = isAdmin ? (req.query.uid === undefined ? 0 : parseId(req.query.uid, 'uid')) : req.user.uid;
        const out = await call(orderClient, 'ListOrders', { uid }, req.user);
        res.status(200).json({ items: out.items.map(presentSummary) });
    }));

    router.get('/:oid', asyncHandler(async (req, res) => {
        const out = await call(orderClient, 'GetOrder', { oid: parseId(req.params.oid, 'oid') }, req.user);
        res.status(200).json(presentOrder(out));
    }));

    // Trạng thái giao hàng của một đơn (CR06). Khách chỉ biết oid, chưa biết shipid.
    // Vận đơn được tạo bất đồng bộ nên vài giây đầu sau khi đặt hàng có thể trả 404.
    router.get('/:oid/shipment', asyncHandler(async (req, res) => {
        const out = await call(shipmentClient, 'GetShipmentByOrder', { oid: parseId(req.params.oid, 'oid') }, req.user);
        res.status(200).json(presentShipment(out));
    }));

    return router;
};