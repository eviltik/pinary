const async = require('async');
const PinaryServer = require('../../').server;
const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    const server = new PinaryServer({ host:'127.0.0.1' });
    let client1;
    let client2;
    let received = false;

    async.series([
        server.start,
        next => {
            test.pass('server started');
            next();
        },
        next => {
            client2 = new PinaryClient();
            client2.on('connected', (retryCount) => {
                if (!retryCount) {
                    test.pass('client2 connected');
                    next();
                } else {
                    test.pass('client2 reconnected');
                }
            });
            client2.subscribe('/bla', (data) => {
                if (data === 'foo') {
                    received = true;
                }
            });
        },
        next => {
            client1 = new PinaryClient();
            client1.on('connected', (retryCount) => {
                if (!retryCount) {
                    test.pass('client1 connected');
                    next();
                } else {
                    test.pass('client1 reconnected');
                }
            });
        },
        server.stop,
        next => {
            test.pass('server stopped');
            // let the time for server to disconnect client1
            setTimeout(next, 500);
        },
        next => {
            test.pass('publish "foo" in channel /bla');
            client1.publish('/bla', 'foo');
            setTimeout(next, 1000);
        },
        server.start,
        next => {
            setTimeout(next, 2000);
        },
        next => {
            client1.close(() => {
                test.pass('client1 closed');
                next();
            });
        },
        next => {
            test.equal(received, true, 'client2 should received message');
            client2.close(() => {
                test.pass('client2 closed');
                next();
            });
        },
        server.stop
    ], () => {
        test.end();
    });


});
