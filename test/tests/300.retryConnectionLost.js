const async = require('async');
const spawn = require('child_process').spawn;

const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    let server;
    let client;
    let reconnected = false;

    function serverStart(callback) {
        server = spawn('node', [__dirname+'/server.js']);
        test.pass(`server started, pid ${server.pid}`);
        if (callback) {
            setTimeout(callback, 1000);
        }
    }

    function serverCrash(callback) {
        server.kill();
        test.pass('server killed');
        callback();
    }

    function clientClose(callback) {
        client.close(() => {
            test.pass('client closed');
            callback();
        });
    }

    function clientConnect(callback) {

        client = new PinaryClient(null);

        client.on('reconnecting', (retryCount) => {
            test.pass(`client emit reconnecting event (retryCount = ${retryCount})`);
            if (retryCount === 3) {
                serverStart();
            }
        });

        client.on('connected', (retryCount) => {
            if (retryCount) {
                reconnected = true;
                test.pass(`client emit connected event (retryCount = ${retryCount})`);
            } else {
                reconnected = false;
                test.pass('client connected');
                callback();
            }
        });

        client.on('error', () => {});

    }

    function waitForReconnect(callback) {
        if (!reconnected) {
            setTimeout(() => {
                waitForReconnect(callback);
            }, 1000);
        } else {
            test.pass('client reconnected');
            callback();
        }
    }

    async.series([
        serverStart,
        clientConnect,
        serverCrash,
        waitForReconnect,
        clientClose,
        serverCrash
    ], () => {
        test.end();
    });

});
