const tap = require('../tap');
const path = require('path');

module.exports = (title, callback) => {

    tap.test(
        path.basename(title),
        { timeout:1000*60 },
        t => {
            callback(t);
        }
    );

};
