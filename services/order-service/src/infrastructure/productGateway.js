const { productClient, call } = require('./grpcClients');

module.exports = {
    check: async (items) => (await call(productClient, 'CheckProducts', { items })).items,
    decrease: (items) => call(productClient, 'DecreaseStock', { items }),
    restore: (items) => call(productClient, 'RestoreStock', { items }),
};