const { validateNewProduct, buildChanges, normalizeStockItems } = require('../domain/product');
const { DomainError } = require('../domain/errors');

const notFound = () => new DomainError('NOT_FOUND', 'Product not found');
const productMissing = (pid) => new DomainError('NOT_FOUND', `Product not found: pid ${pid}`);
const insufficient = (pid, qty, available) =>
    new DomainError('FAILED_PRECONDITION', `Insufficient stock for product ${pid} (requested ${qty}, available ${available})`);

// productRepository được truyền từ ngoài vào (index.js)
function createProductService({ productRepository }) {
    async function list() {
        return productRepository.findAll();
    }

    async function get(pid) {
        const product = await productRepository.findByPid(pid);
        if (!product) throw notFound();
        return product;
    }

    async function create(input) {
        validateNewProduct(input);
        return productRepository.insert({
            pname: input.pname.trim(),
            price: input.price,
            quantity: input.quantity,
        });
    }

    async function update(input) {
        const changes = buildChanges(input, input.updateMask);
        const updated = await productRepository.updateByPid(input.pid, changes);
        if (!updated) throw notFound();
        return updated;
    }

    async function remove(pid) {
        const deleted = await productRepository.deleteByPid(pid);
        if (!deleted) throw notFound();
        return { pid };
    }

    // ----- Dành cho Order Service -----

    // BPM bước 6: trả giá và số lượng hiện có; báo lỗi nếu thiếu sản phẩm hoặc không đủ hàng.
    async function check(items) {
        const wanted = normalizeStockItems(items);
        const found = await productRepository.findManyByPid(wanted.map((w) => w.pid));
        const byPid = new Map(found.map((p) => [p.pid, p]));

        return wanted.map((w) => {
            const product = byPid.get(w.pid);
            if (!product) throw productMissing(w.pid);
            if (product.quantity < w.qty) throw insufficient(w.pid, w.qty, product.quantity);
            return product;
        });
    }

    // Hoàn lại các dòng đã trừ. Lỗi từng dòng chỉ được ghi log để không bỏ sót dòng còn lại.
    async function undo(done) {
        const failed = [];
        for (const w of done) {
            try {
                await productRepository.increase(w.pid, w.qty);
            } catch (e) {
                failed.push(w.pid);
                console.error(`[product] CRITICAL: could not restore stock for pid ${w.pid} (+${w.qty})`, e);
            }
        }
        return failed;
    }

    // BPM bước 7: trừ kho. Mỗi dòng trừ "có điều kiện" (chỉ khi đủ hàng) nên hai đơn đặt cùng lúc
    // không thể làm tồn kho âm. Nếu một dòng thất bại, các dòng đã trừ trước đó được hoàn lại.
    async function decrease(items) {
        const wanted = normalizeStockItems(items);
        const done = [];
        for (const w of wanted) {
            const ok = await productRepository.decreaseIfEnough(w.pid, w.qty);
            if (!ok) {
                await undo(done);
                const product = await productRepository.findByPid(w.pid);
                if (!product) throw productMissing(w.pid);
                throw insufficient(w.pid, w.qty, product.quantity);
            }
            done.push(w);
        }
    }

    // Bù trừ khi Order Service lưu đơn thất bại sau khi đã trừ kho.
    async function restore(items) {
        const wanted = normalizeStockItems(items);
        const failed = await undo(wanted);
        if (failed.length) throw new Error(`could not restore stock for pid ${failed.join(', ')}`);
    }

    return { list, get, create, update, remove, check, decrease, restore };
}

module.exports = { createProductService };