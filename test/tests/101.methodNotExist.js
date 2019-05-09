const async = require('async');
const PinaryServer = require('../../').server;
const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    const server = new PinaryServer({ host:'127.0.0.1' });
    const client = new PinaryClient();

    function callbackClientTriggerUnexistingMethod(callback) {
        client.rpc('test', (err) => {
            test.equal(err, 'UNKNOW_METHOD test', 'callback: should return error "unknow method test"');
            callback();
        });
    }

    async function asyncClientTriggerUnexistingMethod() {
        try {
            await client.rpcPromise('test');
        } catch(e) {
            test.equal(e, 'UNKNOW_METHOD test', 'async/await: should return error "unknow method test"');
        }
    }

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
        callbackClientTriggerUnexistingMethod,
        asyncClientTriggerUnexistingMethod,
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
