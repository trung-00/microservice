const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const { HttpError } = require('../errors');

const INT32_MAX = 2147483647;

function parseId(raw, name) {
    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > INT32_MAX) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return Number(raw);
}

// Đúng dạng trong API Specification: chỉ có shipid, oid, status (uid chỉ dùng nội bộ để kiểm tra quyền).
const presentShipment = (s) => ({ shipid: s.shipid, oid: s.oid, status: s.status });

module.exports = function shipmentRoutes({ call, shipmentClient, authenticate, authorize }) {
    const router = express.Router();
    router.use(authenticate); // mọi route vận đơn đều cần JWT

    // API-SHP-01 | UC12
    router.get('/:shipid', asyncHandler(async (req, res) => {
        const shipment = await call(shipmentClient, 'GetShipment', { shipid: parseId(req.params.shipid, 'shipid') }, req.user);
        res.status(200).json(presentShipment(shipment));
    }));

    // API-SHP-02 | UC11: vai trò -> shipid -> hình dạng body -> (Shipment Service kiểm tra trạng thái hợp lệ -> 404)
    router.patch('/:shipid/status', authorize('SHIPMENT_STAFF', 'ADMIN'), asyncHandler(async (req, res) => {
        const shipid = parseId(req.params.shipid, 'shipid');
        const status = req.body && req.body.status;
        if (typeof status !== 'string') throw new HttpError(400, 'status (string) is required');
        const shipment = await call(shipmentClient, 'UpdateShipmentStatus', { shipid, status }, req.user);
        res.status(200).json(presentShipment(shipment));
    }));

    return router;
};