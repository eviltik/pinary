const async = require('async');
const PinaryServer = require('../../').server;
const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    const server = new PinaryServer({ host:'127.0.0.1' });
    let client;

    async.series([
        server.start,
        next => {
            test.pass('server started');
            next();
        },
        next => {
            client = new PinaryClient();
            client.on('connected', next);
        },
        next => {
            test.pass('client connected');
            next();
        },
        next => {
            client.close(() => {
                test.pass('client closed');
                next();
            });
        },
        server.stop,
        next => {
            test.pass('server stopped');
            next();
        },
    ], () => {
        test.end();
    });


});
