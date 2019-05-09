const net = require('net');
const tls = require('tls');
const EventEmitter = require('events');
const hyperid = require('hyperid');
const async = require('async');
const attributes = require('../../attributes');

const uuid = hyperid(true);
const DEFAULT_QUEUE_SIZE = 100;

class BaseClient extends EventEmitter {

    constructor(port, host, options, reader) {
        super();

        if (reader) {
            this._debug = require('debug')('pinary:reader');
        } else {
            this._debug = require('debug')('pinary:writer');
        }

        this._options = options || { protocol:'dinary' };
        this._options.tls = this._options.protocol.match(/s$/);

        if (!port) {
            switch (this._options.protocol) {
            case 'dinary':
                port = 65000;
                break;
            case 'dinarys':
                port = 65501;
                break;
            }
        }

        this._reader = reader;
        this._port = port;
        this._host = host;

        this._isConnected = false;
        this._eventsByName = null;

        this._requestsQueue = async.queue(
            this.handleRequestsQueue.bind(this),
            options.queueSize||DEFAULT_QUEUE_SIZE
        );
        this._requestsQueue.pause();
        this._requests = {};

        this._subscribedChannels = [];
    }

    /*
     * Privates
     */

    handleRequestsQueue(id, callback) {
        if (!this._requests[id] || !this._isConnected) {
            callback();
            return;
        }

        this.requestSend(
            id,
            this._requests[id].method,
            this._requests[id].params
        );

        callback();
    }

    eventExists(eventName) {

        if (this._eventsByName) {
            return this._eventsByName[eventName];
        }

        if (!this._eventsByName) {
            this._eventsByName = {};
            for (const ev of this.eventNames()) {
                this._eventsByName[ev] = true;
            }
        }

        return this._eventsByName[eventName];
    }

    emitEvent(eventName, data) {
        if (this.eventExists(eventName)) {
            this.emit(eventName, data);
        }
    }

    tlsConnect(callback) {
        return tls.connect(this._port, this.host, {
            secureProtocol: 'TLSv1_2_method',
            rejectUnauthorized: false,
        }, () => {
            this.onConnect(callback);
        });
    }

    tcpConnect(callback) {
        return net.connect({
            port:this._port,
            host:this._host
        }, () => {
            this.onConnect(callback);
        });
    }

    onConnect(callback) {
        this._id = this._socket.localAddress+':'+this._socket.localPort;
        this._debug(`${this._id}: connected`);
        this._isConnected = true;
        this._requestsQueue.resume();
        callback();
    }

    initializeSocket(callback) {

        let s;

        if (this._options.tls) {
            s = this.tlsConnect(callback);
        } else {
            s = this.tcpConnect(callback);
        }

        s.on('timeout', () => {
            this._debug(`${this._id}: timeout`);
            this.emitEvent('timeout');
            this.close();
        });

        s.on('close', () => {
            if (!this._isConnected) return;
            this._debug(`${this._id}:  close`);
            this.emitEvent('close');
            this.unpipeSocket(s);
            this._isConnected = false;
            this._requestsQueue.pause();
        });

        s.on('end', () => {
            if (!this._isConnected) return;
            this._debug(`${this._id}: end`);
            this.emitEvent('end');
            this.unpipeSocket(s);
            this._isConnected = false;
            this._requestsQueue.pause();
            s.destroy();
        });

        s.on('destroy', () => {
            if (!this._isConnected) return;
            this._debug(`${this._id}: destroy`);
            this.emitEvent('destroy');
            this.unpipeSocket(s);
            this._isConnected = false;
            this._requestsQueue.pause();
        });

        s.on('error', (err) => {
            this._debug(`${this._id}: error ${err.message}`);
            callback(err);
            this.emitEvent('error', err);
            this.unpipeSocket(s);
            s.destroy();
        });

        this._socket = s;
        this.pipeSocket(s);
    }

    requestPush(id, method, params, callback) {
        //this._debug(`requestPush ${id}`);
        this._requests[id] = { method, params, callback };
        if (method === '_getReaderId' || method === '_setWriter') {
            this._requestsQueue.unshift(id);
        } else {
            this._requestsQueue.push(id);
        }
    }

    request(op) {
        this._debug(`${this._id}: request method ${op.method}`);
        if (op.callback) {
            this.requestPush(uuid(), op.method, op.params, op.callback);
        } else if (op.reject && op.resolve) {
            this.requestPush(uuid(), op.method, op.params, (err, result) => {
                if (err) {
                    return op.reject(err);
                }
                op.resolve(result);
            });
        } else {
            this.requestPush(uuid(), op.method, op.params);
        }
    }

    /*
     * Public methods
     */

    pipeSocket(socket) {
        // it may be overrided
        if (!socket) {
            throw new Error('No socket passed into function pipeSocket()');
        }
    }

    unpipeSocket(socket) {
        // it may be overrided
        if (!socket) {
            throw new Error('No socket passed into function unpipeSocket()');
        }
    }

    initializeStream() {
        throw new Error('Please override methode _initialize');
    }

    requestSend() {
        throw new Error('Please override methode _requestSend');
    }

    connect(callback) {
        this.initializeStream();
        if (!callback) {
            return new Promise((resolve, reject) => {
                this.initializeSocket((err) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve();
                });
            });
        }

        this.initializeSocket(callback);

    }

    close(callback) {
        if (!this._isConnected) {
            callback && callback();
            return;
        }
        const pendingRequests = Object.keys(this._requests).length;
        if (pendingRequests>0) {
            this._debug(`${this._id}: closing client, but missed ${pendingRequests} pending requests`);
        }
        if (this._socket) {
            this._socket.end();
            this._debug(`${this._id}: client closed`);
        }
        callback && callback();
    }

    onMessage(response) {

        if (!response.id) {

            if (response[attributes.method] && response[attributes.method] === attributes.publish) {
                this._debug(`${this._id}: pubsub: data received on channel ${response[attributes.channel]}`);
                if (this._subscribedChannels[response[attributes.channel]]) {
                    this._subscribedChannels[response[attributes.channel]](response[attributes.data]);
                }
            } else {
                this._debug(`${this._id}: response message don't have any id ! ${JSON.stringify(response)}`);
            }
            return;
        }

        const r = this._requests[response.id];

        // no callback stored for this request ?
        // fake id sent by the "server" ?
        if (!r) {
            if (response[attributes.error]) {
                this._debug(JSON.stringify(response[attributes.error]));
            } else {
                this._debug(JSON.stringify(response));
            }
            this.emitEvent('error', response[attributes.error]);
            return;
        }

        if (process.env.DEBUG || process.env.NODE_ENV === 'dev') {
            if (response[attributes.error]) {
                if (response[attributes.error].message) {
                    this._debug(response[attributes.error].message);
                } else {
                    this._debug(response[attributes.error]);
                }
            }
        }


        try {
            r.callback && r.callback(response[attributes.error], response[attributes.result]);
        } catch(e) {
            this._debug(e);
        }
        delete this._requests[response.id];
    }

    _getReaderId() {
        return new Promise((resolve, reject) => {
            const op = {
                method:'_getReaderId',
                resolve,
                reject
            };
            this.request(op);
        });
    }

    _setWriter(readerId) {
        return new Promise((resolve, reject) => {
            const op = {
                method:'_setWriter',
                params:{ readerId },
                resolve,
                reject
            };

            this.request(op);
        });
    }

    setClosing() {
        this._socket.closing = true;
    }

    isClosing() {
        return this._socket.closing;
    }

    subscribeTo(channel, callback) {
        this._debug(`${this._id}: pubsub: client subscribe to ${channel}`);
        this._subscribedChannels[channel] = callback;
    }

    subscribeToInformServer(channel, encoder) {
        if (!this._isConnected) {
            this._debug(`${this._id}: pubsub: cannot subscribe: not connected`);
            return;
        }

        this._debug(`${this._id}: pubsub: inform server for subscription to ${channel}`);

        const frame = {};
        frame[attributes.method] = attributes.subscribe;
        frame[attributes.channel] = channel;
        encoder.write(frame);
    }

    publishTo(channel, data, encoder) {
        if (!this._isConnected) {
            this._debug(`${this._id}: pubsub: cannot publish: not connected`);
            return;
        }

        this._debug(`${this._id}: pubsub: data published in channel ${channel}`);

        const frame = {};
        frame[attributes.method] = attributes.publish;
        frame[attributes.channel] = channel;
        frame[attributes.data] = data;
        encoder.write(frame);
    }
}

module.exports = BaseClient;
