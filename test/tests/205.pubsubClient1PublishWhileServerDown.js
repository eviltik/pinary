const async = require('async');
const PinaryServer = require('../../').server;
const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    const server = new PinaryServer({ host:'127.0.0.1' });
    const client1 = new PinaryClient();

    client1.on('connected', (retryCount) => {
        if (!retryCount) {
            test.pass('client1 connected');
        } else {
            test.pass('client1 reconnected');
        }
    });

    client1.on('error', (err) => {
        test.pass('client1 should emit error'+err.message);
    });

    async.series([
        server.start,
        next => {
            test.pass('server started');
            next();
        },
        client1.connect,
        server.stop,
        next => {
            test.pass('server stopped');
            // let the time for server to disconnect client1
            setTimeout(next, 500);
        },
        next => {
            client1.publish('/bla', 'foo');
            test.pass('publish "foo" in channel /bla');
            setTimeout(next, 1000);
        },
        client1.close,
        next => {
            test.pass('client1 closed');
            next();
        }
    ], () => {
        test.end();
    });


});
