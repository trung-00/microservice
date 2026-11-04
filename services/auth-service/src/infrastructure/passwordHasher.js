const bcrypt = require('bcryptjs');

module.exports = {
    hash: (plain) => bcrypt.hash(plain, 10),
    compare: (plain, hash) => bcrypt.compare(plain, hash),
};