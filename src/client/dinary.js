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
    self.publishMessages = {};
    self.isConnected = false;
    self.retryCount = 0;

    if (!self.options.reconnectInterval) {
        self.options.reconnectInterval = 1000;
    }

    clientReader.on('socketError', err => {
        debug('socketError', err.message);
        if (err.message.match(/REFUSED|INVAL|HOSTUNREACH/)) {
            setTimeout(() => {
                reconnect();
            }, self.options.reconnectInterval);
        } else {
            self.emit('error', err);
        }
    });

    clientReader.on('socketEnd', () => {
        debug('socketEnd, was connected', self.isConnected);

        if (self.isConnected) {
            self.emit('disconnected');
        }

        self.isConnected = false;

        if (clientReader.isClosing()) {
            clientWriter.close();
            return;
        }

        setTimeout(() => {
            reconnect();
        }, self.options.reconnectInterval);
    });

    clientReader.on('socketConnected', () => {
        debug('socketConnected');
        clientReader._getReaderId((err, readerId) => {
            clientReader.readerId = readerId;
            clientWriter.connect();
        });
    });

    clientWriter.on('socketError', err => {
        debug('socketError', err.message);
        self.emit('error', err);
    });

    clientWriter.on('socketEnd', () => {
        debug('socketEnd');
        if (clientWriter.isClosing()) {
            clientReader.close();
            return;
        }
    });

    clientWriter.on('socketConnected', () => {
        debug('socketConnected');
        clientWriter._setWriter(clientReader.readerId, (err, associated) => {
            if (associated) {
                debug(`writer associated with reader ${clientReader.readerId}`);
                self.emit('connected', self.retryCount);
                self.isConnected = true;
                self.retryCount = 0;
                subscribeChannels();
                pushMessages();
            }
        });
    });

    function reconnect() {
        if (clientReader.isClosing()) {
            return;
        }

        self.retryCount+=1;
        self.emit('reconnecting', self.retryCount);
        connect((err) => {
            if (err) {
                setTimeout(() => {
                    reconnect();
                }, self.options.reconnectInterval);
            }
        });
    }

    function connect() {
        clientReader.connect();
    }

    function close(callback) {
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

    function subscribeChannels() {
        for (const channel in self.subscribedChannels) {
            clientReader.subscribeTo(channel, self.subscribedChannels[channel]);
            clientWriter.subscribeToInformServer(channel, clientWriter._encoder);
        }
    }

    function subscribe(channel, callback) {
        if (!self.subscribedChannels[channel]) {
            self.subscribedChannels[channel] = callback;
            if (!self.isConnected) {
                debug(`subscribe: will subscribe to ${channel} when connected`);
            } else {
                debug(`subscribe: subscribing to ${channel}`);
                clientReader.subscribeTo(channel, callback);
                clientWriter.subscribeToInformServer(channel, clientWriter._encoder);
            }
        }
    }

    function pushMessages() {
        debug('pushMessages', self.isConnected);
        if (!self.isConnected) return;
        for (const channel in self.publishMessages) {
            debug('empty messages queue', self.publishMessages[channel].length);
            while (self.publishMessages[channel].length) {
                clientWriter.publishTo(channel, self.publishMessages[channel].shift(), clientWriter._encoder);
            }
        }
    }

    function publish(channel, data) {
        if (self.isConnected) {
            clientWriter.publishTo(channel, data, clientWriter._encoder);
            return;
        }
        if (!self.publishMessages[channel]) {
            self.publishMessages[channel] = [];
        }
        debug(`adding message to publishing in channel ${channel}`);
        self.publishMessages[channel].push(data);
        pushMessages();
    }

    self.close = promisify(close);
    self.protocol = options.protocol;
    self.rpc = rpc;
    self.rpcPromise = promisify(rpc);
    self.subscribe = subscribe;
    self.publish = publish;

    connect();

    return self;

}

util.inherits(DinaryClient, EventEmitter);

module.exports = DinaryClient;
