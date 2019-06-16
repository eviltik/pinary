const net = require('net');
const tls = require('tls');
const EventEmitter = require('events');
const hyperid = require('hyperid');
const async = require('async');
const attributes = require('../../attributes');
const frame = require('../../frame');
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
        this._eventsByName = {};

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

        if (this._eventsByName[eventName]) {
            //this._debug(`event ${eventName} found`);
        } else {
            this._debug(`event ${eventName} NOT found`);
        }

        return this._eventsByName[eventName];
    }

    emitEvent(eventName, data) {
        const fn = this.eventExists(eventName);
        if (fn) fn(data);
    }

    tlsConnect() {
        return tls.connect(this._port, this._host, {
            secureProtocol: 'TLSv1_2_method',
            rejectUnauthorized: false,
        }, () => {
            this.onConnect();
        });
    }

    tcpConnect() {
        return net.connect({
            port:this._port,
            host:this._host
        }, () => {
            this.onConnect();
        });
    }

    onConnect() {
        this._id = this._socket.localAddress+':'+this._socket.localPort;
        this._debug(`${this._id}: connected`);
        this._isConnected = true;
        this._requestsQueue.resume();
        this.emitEvent('socketConnected');
    }

    initializeSocket() {

        let s;

        if (this._options.tls) {
            s = this.tlsConnect();
        } else {
            s = this.tcpConnect();
        }

        s.timeoutTimer = setTimeout(() => {
            this._debug(`${this._id||this._host+':'+this._port}: timeout`);
            this.emitEvent('socketTimeout');
            this.close();
            s.destroy();
        }, 1000);

        s.on('timeout', () => {
            this._debug(`${this._id||this._host+':'+this._port}: timeout`);
            this.emitEvent('socketTimeout');
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
            this.emitEvent('socketEnd');
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
            this._debug(`${this._id||this._host+':'+this._port}: error ${err.message}`);
            this.emitEvent('socketError', err);
            this.unpipeSocket(s);
            s.destroy();
        });

        s.on('connect', () => {
            clearTimeout(s.timeoutTimer);
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

    connect() {
        this.removeAllListeners();
        this.initializeStream();
        this.initializeSocket();

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

    _getReaderId(callback) {
        const op = {
            method:'_getReaderId',
            callback
        };
        this.request(op);
    }

    _setWriter(readerId, callback) {
        const op = {
            method:'_setWriter',
            params:{ readerId },
            callback
        };
        this.request(op);
    }

    setClosing() {
        this._socket.closing = true;
    }

    isClosing() {
        return this._socket.closing;
    }

    subscribeTo(channel, callback) {
        this._debug(`${this._id}: pubsub: client subscribing to ${channel}`);
        this._subscribedChannels[channel] = callback;
    }

    subscribeToInformServer(channel, encoder) {
        if (!this._isConnected) {
            this._debug(`${this._id}: pubsub: cannot subscribe: not connected`);
            return false;
        }

        this._debug(`${this._id}: pubsub: inform server for subscription to ${channel}`);
        encoder.write(frame.subscribe(channel));
        return true;
    }

    publishTo(channel, data, encoder) {
        if (!this._isConnected) {
            this._debug(`${this._id}: pubsub: cannot publish: not connected`);
            return false;
        }

        this._debug(`${this._id}: pubsub: data published in channel ${channel}`);
        encoder.write(frame.publish(channel, data));
        return true;
    }

    on(event, fn) {
        //this._debug(`register event ${event}`);
        this._eventsByName[event] = fn;
    }
}

module.exports = BaseClient;
