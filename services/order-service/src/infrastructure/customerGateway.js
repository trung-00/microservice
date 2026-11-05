const { customerClient, call } = require('./grpcClients');

module.exports = {
    getCustomer: (uid, caller) => call(customerClient, 'GetCustomer', { uid }, caller),
    getMembership: (uid, caller) => call(customerClient, 'GetMembership', { uid }, caller),
};