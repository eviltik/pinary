const async = require('async');
const spawn = require('child_process').spawn;

const PinaryClient = require('../../').client;

require('./testWrap')(__filename, (test) => {

    let server;
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

    const client = new PinaryClient(null, {
        //reconnectInterval:500,
        //reconnectMaxAttempts:5,
        //reconnectWaitAfterMaxAttempsReached:2000
    });

    client.on('error', (err) => {
        if (err.message.match(/REFUSED/)) {
            test.pass('client emit error event (CONNECTION REFUSED)');
        }
    });

    client.on('reconnecting', (retryCount) => {
        test.pass(`client emit reconnecting event (retryCount = ${retryCount})`);
        if (retryCount === 5) {
            console.log('reached');
        }
    });

    client.on('connected', (retryCount) => {
        if (retryCount) {
            reconnected = true;
            test.pass(`client emit connected event (retryCount = ${retryCount})`);
        }
    });

    function clientConnect(callback) {
        setTimeout(() => {
            callback();
        }, 2000);
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
        clientConnect,
        serverStart,
        waitForReconnect,
        clientClose,
        serverCrash
    ], () => {
        test.end();
    });

});
