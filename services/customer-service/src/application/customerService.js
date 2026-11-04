const { assertCanAccess, validateNewCustomer, buildChanges } = require('../domain/customer');
const { DomainError } = require('../domain/errors');

const notFound = (what) => new DomainError('NOT_FOUND', `${what} not found`);

// customerRepository được truyền từ ngoài vào (index.js)
function createCustomerService({ customerRepository }) {
    // Idempotent: gọi nhiều lần cho cùng uid vẫn chỉ có một Customer.
    async function create(input) {
        const { uid, fullname } = validateNewCustomer(input);
        return customerRepository.createIfAbsent({ uid, fullname });
    }

    async function get(uid, caller) {
        assertCanAccess(caller, uid);
        const customer = await customerRepository.findByUid(uid);
        if (!customer) throw notFound('Customer');
        return customer;
    }

    async function getMembership(uid, caller) {
        assertCanAccess(caller, uid);
        const membership = await customerRepository.findMembershipByUid(uid);
        if (!membership) throw notFound('Customer');
        return membership;
    }

    async function update(input, caller) {
        const changes = buildChanges(caller, input, input.updateMask);
        const updated = await customerRepository.updateByUid(input.uid, changes);
        if (!updated) throw notFound('Customer');
        return updated;
    }

    return { create, get, getMembership, update };
}

module.exports = { createCustomerService };