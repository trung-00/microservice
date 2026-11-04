const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const { HttpError } = require('../errors');

const INT32_MAX = 2147483647;

function parsePid(raw) {
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > INT32_MAX) {
        throw new HttpError(400, 'pid must be a positive integer');
    }
    return Number(raw);
}

// Gateway chỉ kiểm tra "hình dạng" dữ liệu (đúng kiểu hay chưa).
// Luật nghiệp vụ (giá >= 0, tên không rỗng...) do Product Service kiểm tra.
const TYPE_OK = {
    pname: (v) => typeof v === 'string',
    price: (v) => typeof v === 'number',
    quantity: (v) => Number.isInteger(v),
};

function parseCreate(body) {
    const { pname, price, quantity } = body || {};
    if (!TYPE_OK.pname(pname) || !TYPE_OK.price(price) || !TYPE_OK.quantity(quantity)) {
        throw new HttpError(400, 'pname (string), price (number) and quantity (integer) are required');
    }
    return { pname, price, quantity };
}

// Cập nhật một phần: updateMask liệt kê các field có trong JSON body.
function parseUpdate(body) {
    const data = body || {};
    const updateMask = Object.keys(TYPE_OK).filter((k) => data[k] !== undefined);
    for (const k of updateMask) {
        if (!TYPE_OK[k](data[k])) throw new HttpError(400, `${k} has an invalid type`);
    }
    return { pname: data.pname ?? '', price: data.price ?? 0, quantity: data.quantity ?? 0, updateMask };
}

module.exports = function productRoutes({ call, productClient, authenticate, authorize }) {
    const router = express.Router();
    router.use(authenticate); // mọi route sản phẩm đều cần JWT

    router.get('/', asyncHandler(async (req, res) => {
        const out = await call(productClient, 'ListProducts', {}, req.user);
        res.status(200).json({ items: out.items });
    }));

    router.get('/:pid', asyncHandler(async (req, res) => {
        const product = await call(productClient, 'GetProduct', { pid: parsePid(req.params.pid) }, req.user);
        res.status(200).json(product);
    }));

    router.post('/', authorize('ADMIN'), asyncHandler(async (req, res) => {
        const product = await call(productClient, 'CreateProduct', parseCreate(req.body), req.user);
        res.status(201).json(product);
    }));

    router.put('/:pid', authorize('ADMIN'), asyncHandler(async (req, res) => {
        const pid = parsePid(req.params.pid);
        const out = await call(productClient, 'UpdateProduct', { pid, ...parseUpdate(req.body) }, req.user);
        res.status(200).json({ message: 'Product updated successfully', pid: out.pid });
    }));

    router.delete('/:pid', authorize('ADMIN'), asyncHandler(async (req, res) => {
        const out = await call(productClient, 'DeleteProduct', { pid: parsePid(req.params.pid) }, req.user);
        res.status(200).json({ message: 'Product deleted successfully', pid: out.pid });
    }));

    return router;
};