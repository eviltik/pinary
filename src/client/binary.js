//const debug = require('debug')('pinary:client');
const missive = require('missive');
const Client = require('./lib/Client');
const attributes = require('../attributes');

const ZLIB = false;

class BinaryClient extends Client {

    constructor() {
        super(...arguments);
        this._decoder = null;
        this._encoder = null;
    }

    initializeStream() {
        this._decoder = missive.parse({ inflate: ZLIB });
        this._decoder.on('message', this.onMessage.bind(this));
        this._encoder = missive.encode({ deflate:ZLIB });
    }

    pipeSocket(socket) {
        socket.pipe(this._decoder);
        this._encoder.pipe(socket);
    }

    unpipeSocket(socket) {
        socket.unpipe(this._decoder);
        this._encoder.unpipe(socket);
    }

    requestSend(id, method, params) {
        const req = {};
        req.id = id;
        req[attributes.method] = method;
        if (params) {
            req[attributes.params] = params;
        }
        this._encoder.write(req);
    }

}

module.exports = BinaryClient;
