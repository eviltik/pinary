const async = require('async');
const PinaryServer = require('../../').server;
const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    const server = new PinaryServer({ host:'127.0.0.1' });
    const client1 = new PinaryClient();
    const client2 = new PinaryClient();

    let received = false;

    async.series([
        server.start,
        next => {
            test.pass('server started');
            next();
        },
        client1.connect,
        next => {
            test.pass('client1 connected');
            next();
        },
        client2.connect,
        next => {
            test.pass('client2 connected');
            next();
        },
        next => {
            client1.subscribe('/bla', (data) => {
                test.pass('received "foo" from channel /bla');
                if (data === 'foo') {
                    received = true;
                }
            });
            next();
        },
        next => {
            client2.publish('/bla', 'foo');
            test.pass('publish "foo" in channel /bla');
            setTimeout(next, 1000);
        },
        next => {
            if (received) {
                test.pass('foo received');
            } else {
                test.fail('foo not received');
            }
            next();
        },
        client1.close,
        next => {
            test.pass('client1 closed');
            next();
        },
        client2.close,
        next => {
            test.pass('client2 closed');
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
