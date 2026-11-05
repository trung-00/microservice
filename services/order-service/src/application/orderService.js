const { normalizeItems, buildOrder } = require('../domain/order');
const { discountPercent } = require('../domain/discountPolicy');
const { DomainError } = require('../domain/errors');

const isAdmin = (caller) => caller.role === 'ADMIN';
const isCustomer = (caller) => caller.role === 'CUSTOMER';

// orderRepository, customerGateway, productGateway được truyền từ ngoài vào (index.js)
function createOrderService({ orderRepository, customerGateway, productGateway }) {
    // Luồng đặt hàng: các dòng chú thích BPM là số bước trong hình Business Process Model.
    async function create(input, caller) {
        if (!caller.uid || input.uid !== caller.uid) {
            throw new DomainError('PERMISSION_DENIED', 'You can only place orders for yourself');
        }
        const items = normalizeItems(input.items);

        await customerGateway.getCustomer(caller.uid, caller); // BPM 3: lấy thông tin Customer (404 nếu chưa có)
        const { score } = await customerGateway.getMembership(caller.uid, caller); // BPM 4: lấy điểm thành viên
        const percent = discountPercent(score); // BPM 5: mức giảm theo score
        const products = await productGateway.check(items); // BPM 6: giá và tồn kho (404/409 nếu sai)
        const order = buildOrder({ uid: caller.uid, items, products, percent });

        await productGateway.decrease(items); // BPM 7: trừ kho
        try {
            const saved = await orderRepository.save(order); // BPM 8 + 9: Order, OrderDetail, OutboxEvent cùng một giao dịch
            return { ...saved, shipmentStatus: 'PENDING' };
        } catch (e) {
            // Lưu đơn thất bại sau khi đã trừ kho: hoàn kho để dữ liệu không bị lệch (UC06).
            await productGateway
                .restore(items)
                .catch((err) => console.error('[order] CRITICAL: could not restore stock after failed save', items, err.message));
            throw e;
        }
    }

    async function get(oid, caller) {
        const order = await orderRepository.findById(oid);
        if (!order) throw new DomainError('NOT_FOUND', 'Order not found');
        if (!isAdmin(caller) && !(isCustomer(caller) && order.uid === caller.uid)) {
            throw new DomainError('PERMISSION_DENIED', 'You can only access your own orders');
        }
        return order;
    }

    // uid = 0 nghĩa là "tất cả" và chỉ ADMIN được dùng.
    async function list(input, caller) {
        if (isAdmin(caller)) return orderRepository.listByUid(input.uid);
        if (isCustomer(caller) && input.uid === caller.uid) return orderRepository.listByUid(caller.uid);
        throw new DomainError('PERMISSION_DENIED', 'You can only access your own orders');
    }

    return { create, get, list };
}

module.exports = { createOrderService };