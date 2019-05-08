const async = require('async');
const PinaryServer = require('../../').server;
const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    const server = new PinaryServer({ host:'127.0.0.1' });
    const client = new PinaryClient();

    async.series([
        server.start,
        next => {
            test.pass('server started');
            next();
        },
        client.connect,
        next => {
            test.pass('client connected');
            next();
        },
        client.close,
        next => {
            test.pass('client closed');
            next();
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
