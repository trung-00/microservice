const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const { HttpError } = require('../errors');

const INT32_MAX = 2147483647;

function parseUid(raw) {
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > INT32_MAX) {
        throw new HttpError(400, 'uid must be a positive integer');
    }
    return Number(raw);
}

// Gateway chỉ kiểm tra "hình dạng" dữ liệu. Ai được sửa gì (CUSTOMER chỉ sửa fullname của mình,
// chỉ ADMIN đổi mid) do Customer Service quyết định dựa trên danh tính trong metadata.
const TYPE_OK = {
    fullname: (v) => typeof v === 'string',
    mid: (v) => Number.isInteger(v),
};

// Cập nhật một phần: updateMask liệt kê các field có trong JSON body.
function parseUpdate(body) {
    const data = body || {};
    const updateMask = Object.keys(TYPE_OK).filter((k) => data[k] !== undefined);
    for (const k of updateMask) {
        if (!TYPE_OK[k](data[k])) throw new HttpError(400, `${k} has an invalid type`);
    }
    return { fullname: data.fullname ?? '', mid: data.mid ?? 0, updateMask };
}

module.exports = function customerRoutes({ call, customerClient, authenticate }) {
    const router = express.Router();
    router.use(authenticate); // mọi route khách hàng đều cần JWT (TC-CUS-05)

    router.get('/:uid', asyncHandler(async (req, res) => {
        const customer = await call(customerClient, 'GetCustomer', { uid: parseUid(req.params.uid) }, req.user);
        res.status(200).json(customer);
    }));

    router.get('/:uid/membership', asyncHandler(async (req, res) => {
        const uid = parseUid(req.params.uid);
        const m = await call(customerClient, 'GetMembership', { uid }, req.user);
        res.status(200).json({ uid, mid: m.mid, mname: m.mname, score: m.score });
    }));

    router.put('/:uid', asyncHandler(async (req, res) => {
        const uid = parseUid(req.params.uid);
        const out = await call(customerClient, 'UpdateCustomer', { uid, ...parseUpdate(req.body) }, req.user);
        res.status(200).json({ message: 'Customer updated successfully', uid: out.uid });
    }));

    return router;
};