const async = require('async');
const PinaryServer = require('../../').server;
const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    const server = new PinaryServer({ host:'127.0.0.1' });
    const client1 = new PinaryClient();
    const client2 = new PinaryClient();

    let received = false;

    client1.on('connected', (retryCount) => {
        if (!retryCount) {
            test.pass('client1 connected');
        } else {
            test.pass('client1 reconnected');
        }

        client1.subscribe('/bla', (data) => {
            test.pass('received "foo" from channel /bla');
            if (data === 'foo') {
                received = true;
            }
        });
    });

    client2.on('connected', (retryCount) => {
        if (!retryCount) {
            test.pass('client2 connected');
        } else {
            test.pass('client2 reconnected');
        }
    });

    async.series([
        server.start,
        next => {
            test.pass('server started');
            next();
        },
        client1.connect,
        client2.connect,
        server.stop,
        next => {
            test.pass('server stopped');
            next();
        },
        server.start,
        next => {
            test.pass('server started');
            next();
        },
        next => {
            // let the time for clients to reconnect
            setTimeout(next, 1100);
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
        }
    ], () => {
        test.end();
    });


});
