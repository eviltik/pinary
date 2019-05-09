const util = require('util');
const EventEmitter = require('events').EventEmitter;
const BinaryClient = require('./binary');
const promisify = require('util').promisify;
const debug = require('debug')('pinary:dinary');

function DinaryClient(port, host, options) {

    const clientReader = new BinaryClient(port, host, options, 'reader');
    const clientWriter = new BinaryClient(port, host, options);
    const self = this;

    self.options = options || {};
    self.subscribedChannels = {};

    if (!self.options.reconnectInterval) {
        self.options.reconnectInterval = 1000;
    }

    if (!self.options.reconnectMaxAttempts) {
        self.options.reconnectMaxAttempts = 10;
    }

    if (!self.options.reconnectWaitAfterMaxAttempsReached) {
        self.options.reconnectWaitAfterMaxAttempsReached = 1000* 60;
    }

    self.retryCount = 0;

    clientReader.on('error', err => {
        this.emit('error', err);
        debug('error', err.message);
    });

    clientWriter.on('error', err => {
        this.emit('error', err);
        debug('error', err.message);
    });

    clientWriter.on('end', () => {
        if (clientWriter.isClosing()) {
            clientReader.close();
            return;
        }
    });

    clientReader.on('end', () => {
        if (clientReader.isClosing()) {
            clientWriter.close();
            return;
        }

        setTimeout(() => {
            reconnect();
        }, self.options.reconnectInterval);
    });

    function reconnect() {
        self.retryCount+=1;
        self.emit('reconnecting', self.retryCount);
        self.connect((err) => {
            if (err) {
                let delay;
                if (self.retryCount%self.options.reconnectMaxAttempts === 0) {
                    delay = self.options.reconnectWaitAfterMaxAttempsReached;
                } else {
                    delay = self.options.reconnectInterval;
                }
                debug(`retry to connect in ${delay}ms`);
                setTimeout(() => {
                    reconnect();
                }, delay);
            }
        });
    }

    async function connect(callback) {
        let readerId;
        try {
            debug('connecting reader ...');
            await clientReader.connect();
            readerId = await clientReader._getReaderId();
        } catch(e) {
            callback && callback(e);
            return;
        }

        let associated = false;
        try {
            debug(`connecting writer ... (readerId = ${readerId})`);
            await clientWriter.connect();
            associated = await clientWriter._setWriter(readerId);
        } catch (e) {
            callback && callback(e);
            return;
        }

        if (!associated) {
            self.emit('error', 'can not stick writer with reader');
        }

        self.emit('connected', self.retryCount);
        self.retryCount = 0;

        callback && callback();

    }

    async function close(callback) {
        try {
            clientReader.setClosing();
            clientWriter.setClosing();
            clientReader.close(() => {
                // let the server trigger some events
                // before considering client are really closed
                if (callback) {
                    setTimeout(callback, 100);
                }
            });
        } catch(e) {
            callback && callback(e);
        }
    }

    function rpc(method, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = null;
        }

        return clientWriter.request({
            method,
            params,
            callback
        });
    }

    function subscribe(channel, callback) {
        clientReader.subscribeTo(channel, callback);
    }

    function publish(channel, data) {
        clientWriter.publishTo(channel, data, clientWriter._encoder);
    }

    self.connect = promisify(connect);
    self.close = promisify(close);
    self.protocol = options.protocol;
    self.rpc = rpc;
    self.rpcPromise = promisify(rpc);
    self.subscribe = subscribe;
    self.publish = publish;

    return self;

}

util.inherits(DinaryClient, EventEmitter);

module.exports = DinaryClient;
