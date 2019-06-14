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
            client1 = new PinaryClient();
            client1.on('connected', (retryCount) => {
                if (!retryCount) {
                    test.pass('client1 connected');
                    next();
                } else {
                    test.pass('client1 reconnected');
                }
            });
            client1.subscribe('/bla', (data) => {
                test.pass('client1 received "foo" from channel /bla');
                if (data === 'foo') {
                    received = true;
                }
            });
        },
        next => {
            client2 = new PinaryClient();
            client2.on('connected', (retryCount) => {
                if (!retryCount) {
                    test.pass('client2 connected');
                    next();
                }
            });
        },
        next => {
            // let the time for clients to connect
            setTimeout(next, 1100);
        },
        next => {
            client1.close(() => {
                test.pass('client1 closed');
                next();
            });
        },
        next => {
            client2.publish('/bla', 'foo');
            test.pass('publish "foo" in channel /bla');
            setTimeout(next, 1000);
        },
        next => {
            if (!received) {
                test.pass('foo not received');
            } else {
                test.fail('foo received');
            }
            next();
        },
        next => {
            client2.close(() => {
                test.pass('client2 closed');
                next();
            });
        },
        server.stop,
        next => {
            test.pass('server stopped');
            next();
        }
    ], () => {
        test.end();
    });


});
