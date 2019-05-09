const debug = require('debug')('pinary:client');
const net = require('net');
const tls = require('tls');
const EventEmitter = require('events');
const hyperid = require('hyperid');
const async = require('async');

const uuid = hyperid(true);
const DEFAULT_QUEUE_SIZE = 10;

class BaseClient extends EventEmitter {

    constructor(port, host, options) {
        super();

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
        debug('connected');
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
            debug('timeout');
            this.emitEvent('timeout');
            this.close();
        });

        s.on('close', () => {
            if (!this._isConnected) return;
            debug('close');
            this.emitEvent('close');
            this.unpipeSocket(s);
            this._isConnected = false;
            this._requestsQueue.pause();
        });

        s.on('end', () => {
            if (!this._isConnected) return;
            debug('end');
            this.emitEvent('end');
            this.unpipeSocket(s);
            this._isConnected = false;
            this._requestsQueue.pause();
            s.destroy();
        });

        s.on('destroy', () => {
            if (!this._isConnected) return;
            debug('destroy');
            this.emitEvent('destroy');
            this.unpipeSocket(s);
            this._isConnected = false;
            this._requestsQueue.pause();
        });

        s.on('error', (err) => {
            debug('error', err.message);
            callback(err);
            this.emitEvent('error', err);
            this.unpipeSocket(s);
            s.destroy();
        });

        this._socket = s;
        this.pipeSocket(s);
    }

    requestPush(id, method, params, callback) {
        debug(`requestPush ${id}`);
        this._requests[id] = { method, params, callback };
        if (method === '_getReaderId' || method === '_setWriter') {
            this._requestsQueue.unshift(id);
        } else {
            this._requestsQueue.push(id);
        }
    }

    request(op) {
        debug(`request ${op.method}`);
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
            debug(`closing client, but missed ${pendingRequests} pending requests`);
        }
        if (this._socket) {
            this._socket.end();
            debug('client closed');
        }
        callback && callback();
    }

    onMessage(response) {

        if (!response.id) {
            debug(`response message don't have any id ! ${JSON.stringify(response)}`);
            return;
        }

        const r = this._requests[response.id];

        // no callback stored for this request ?
        // fake id sent by the "server" ?
        if (!r) {
            if (response.error) {
                debug(JSON.stringify(response.error));
            } else {
                debug(JSON.stringify(response));
            }
            this.emitEvent('error', response.error);
            return;
        }

        if (process.env.DEBUG || process.env.NODE_ENV === 'dev') {
            if (response.error) {
                if (response.error.message) {
                    debug(response.error.message);
                } else {
                    debug(response.error);
                }
            }
        }


        try {
            r.callback && r.callback(response.error, response.r || response.result);
        } catch(e) {
            debug(e);
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
}

module.exports = BaseClient;
