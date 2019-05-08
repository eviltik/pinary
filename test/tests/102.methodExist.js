const async = require('async');
const PinaryServer = require('../../').server;
const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    const server = new PinaryServer({ host:'127.0.0.1' });

    require('./myMethod')(server);

    const client = new PinaryClient();

    function callbackClientTriggerExistingMethod(callback) {
        client.method('myMethod', (err, result) => {
            test.equal(err, undefined, 'callback: should not return an error');
            test.equal(result, true, 'callback: should return true');
            callback();
        });
    }

    async function asyncClientTriggerExistinggMethod() {
        let result;
        try {
            result = await client.method('myMethod');
        } catch(e) {
            test.equal(e, null, 'async/await: should not return an error');
        }
        test.equal(null, null, 'async/await: should not return an error');
        test.equal(result, true, 'async/await: should return true');
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
        callbackClientTriggerExistingMethod,
        asyncClientTriggerExistinggMethod,
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
