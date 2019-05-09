const methods = require('./methods/');
const net = require('net');
const tls = require('tls');
const missive = require('missive');
const debug = require('debug')('pinary:server');
const merge = require('deepmerge');
const handler = require('./methods/handler');
const async = require('async');
const attributes = require('../attributes');

const DEFAULT_OPTIONS = {
    useTLS:false,
    useZLIB: false,
    maxClients:10,
    host:'0.0.0.0',
    port:65000,
    key:null,
    cert:null,
    ca:null, // should be an array of ca
    secureProtocol: 'TLSv1_2_method',
    rejectUnauthorized: false,
    timeoutData:1000
};

function Server(options) {

    options = merge(DEFAULT_OPTIONS, options||{});

    let server;
    const subscribedChannels = {};

    function rpcIn(task) {

        methods.exec(task.data.m, task.data.p, { server, session:task.socket }, (err, result) => {

            if (err) {

                if (err instanceof Error) {
                    task.encoder.write({
                        id:task.data.id,
                        error:{
                            code:errors.ERROR_CODE_PARAMETER,
                            message:err.message
                        }
                    });

                    debug(`${task.socket.id}: ${err.stack}`);
                    return;
                }

                task.encoder.write({ id: task.data.id, error: err });
                debug(`${task.socket.id}: ${err.message}`);
                return;
            }

            task.encoder.write({
                id:task.data.id,
                r:result
            });
        });
    }

    function onServerError(err) {
        debug(err);
    }

    function onConnect(socket) {

        server.emit('connect');

        socket.killer = setTimeout(() => {
            // kill the socket if nothing append on it
            socket.end();
        }, options.timeoutData);

        socket.setNoDelay(true);

        socket.id = `${socket.remoteAddress}:${socket.remotePort}`;

        socket.on('end', () => {
            debug(`${socket.id}: client socket end`);
            server.clients[socket.id].socket.destroy();
            delete server.clients[socket.id];
            delete server.clientsReader[socket.id];
        });

        socket.on('error', err => {
            debug(`${socket.id}: ${err.message}`);
            delete server.clients[socket.id];
            delete server.clientsReader[socket.id];
        });

        socket.once('data', () => {
            clearTimeout(socket.killer);
        });

        debug(`${socket.id}: client connected`);

        const encoder = missive.encode({ deflate: options.useZLIB });
        const decoder = missive.parse({ inflate: options.useZLIB });

        decoder.on('message', data => {

            const mid = data[attributes.id];
            const mmethod = data[attributes.method];
            const mparams = data[attributes.params];
            const mdata = data[attributes.data];

            if (server._connections>(options.maxClients*2)) {
                debug(`${socket.id}: refusing connection, number of connection: ${server._connections-1}, allowed: ${options.maxClients*2}`);
                const frame = {};
                frame[attributes.id] = mid;
                frame[attributes.error] = 'MAX_CLIENT_REACHED';
                encoder.write(frame);
                socket.end();
                return;
            }

            if (!mmethod) {
                debug(`${socket.id}: missing method in the payload`);
                const frame = {};
                frame[attributes.id] = mid;
                frame[attributes.error] = 'MISSING_METHOD_ATTRIBUTE';
                encoder.write(frame);
                return;
            }

            if (mmethod === attributes.publish) {
                const mchannel = data[attributes.channel];
                if (subscribedChannels[mchannel]) {
                    subscribedChannels[mchannel](mdata);
                }
                publish(mchannel, mdata);
                return;
            }

            if (!methods.exists(mmethod)) {
                debug(`${socket.id}: unknow method ${mmethod}`);
                const frame = {};
                frame[attributes.id] = mid;
                frame[attributes.error] = `UNKNOW_METHOD ${mmethod}`;
                encoder.write(frame);
                return;
            }

            if (mparams) {
                debug(`${socket.id}: method ${mmethod}: exec with params ${JSON.stringify(mparams)}`);
            } else {
                debug(`${socket.id}: method ${mmethod}: exec without params`);
            }

            rpcIn({ data, socket, encoder });
        });

        decoder.on('error', err => {
            debug(err);
        });

        socket.pipe(decoder);
        encoder.pipe(socket);

        server.clients[socket.id] = { socket, encoder };

    }

    function start(callback) {

        debug(`server starting ... (${options.host}:${options.port} maxClients ${options.maxClients*2})`);

        methods.initialize();

        function _onServerListen(err) {

            if (err) {
                debug(err);
                throw new Error(err);
            }

            debug(`server started (maxClients ${options.maxClients*2})`);
            callback && callback();
        }

        if (options.useTLS) {

            server = tls.createServer({
                key:options.key,
                cert:options.cert,
                ca:options.ca,
                secureProtocol:options.secureProtocol,
                rejectUnauthorized: options.rejectUnauthorized
            });

            server.on('tlsClientError', (err) => {
                debug(err.message);
            });

            server.on('secureConnection', onConnect);

        } else {

            server = net.createServer();
            server.on('connection', onConnect);

        }

        server.clients = {};
        server.clientsReader = {};

        server.on('listening', _onServerListen);
        server.on('error', onServerError);

        server.getMaxClients = () => {
            return options.maxClients;
        };

        server.setMaxClients = m => {
            options.maxClients = m;
        };

        server.listen(options.port, options.host);

    }

    function stop(callback) {
        let closed = 0;
        try {
            let id;
            for (id in server.clients) {
                debug(`server stopping: disconnecting client ${id}`);
                server.clients[id].encoder.write(JSON.stringify({ error:errors.SERVER_SHUTDOWN }));
                server.clients[id].socket.end();
                server.clients[id].socket.destroy();
                delete server.clients[id];
                delete server.clientsReader[id];
                closed++;
            }
        } catch(e) {
            debug(e);
        }

        if (closed) {
            debug(`${closed} client(s) has been closed`);
        }

        server.close(err => {
            if (err) {
                debug(err);
            }

            debug('server closed');

            if (callback) {
                callback();
            }
        });
    }

    function registerMethod(descriptor, fn) {
        methods.register(new handler.Method(descriptor, fn));
    }

    function on(eventName, fn) {
        server.on(eventName, fn);
    }

    function publish(channel, data) {
        async.mapValues(server.clientsReader, (client) => {
            try {
                const frame = {};
                frame[attributes.method] = attributes.publish;
                frame[attributes.channel] = channel;
                frame[attributes.data] = data;
                client.write(frame);
            } catch(e) {
                debug(e);
            }
        });
    }

    function subscribe(channel, callback) {
        debug(`pubsub: server subscribe to ${channel}`);
        subscribedChannels[channel] = callback;
    }

    return {
        start,
        stop,
        registerMethod,
        on,
        publish,
        subscribe
    };
}

module.exports = Server;
