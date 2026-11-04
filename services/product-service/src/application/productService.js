const { validateNewProduct, buildChanges } = require('../domain/product');
const { DomainError } = require('../domain/errors');

const notFound = () => new DomainError('NOT_FOUND', 'Product not found');

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

    return { list, get, create, update, remove };
}

module.exports = { createProductService };