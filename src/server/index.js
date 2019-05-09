const methods = require('./methods/');
const net = require('net');
const tls = require('tls');
const missive = require('missive');
const debug = require('debug')('pinary:server');
const merge = require('deepmerge');
const handler = require('./methods/handler');
const async = require('async');
const attributes = require('../attributes');
const frame = require('../frame');

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
    let serverSubscribedChannels = {};
    let clientsSubscribedChannel = {};

    function RPCCall(task) {

        methods.exec(
            task.data.m,
            task.data.p,
            { server, session:task.socket },
            (err, result) => {

                if (err) {

                    if (err instanceof Error) {
                        task.encoder.write(frame.error(task.data.id, 'ERROR_CODE_PARAMETER'));
                        debug(`${task.socket.id}: ${err.stack}`);
                        return;
                    }

                    task.encoder.write(frame.error(task.data.id, err));
                    debug(`${task.socket.id}: ${err.message}`);
                    return;
                }

                task.encoder.write(frame.result(task.data.id, result));
            }
        );
    }

    function removeClient(socketId) {
        delete server.clients[socketId];
        delete server.clientsReader[socketId];
        async.mapValues(clientsSubscribedChannel, (clientsId, channel, next) => {
            const idx = clientsId.indexOf(socketId);
            if (idx>=0) {
                clientsSubscribedChannel[channel].splice(idx, 1);
            }
            next();
        });
    }

    function onServerError(err) {
        debug(err);
    }

    function onConnect(socket) {
        socket.setNoDelay(true);
        server.emit('connect');

        socket.killer = setTimeout(() => {
            // kill the socket if nothing append on it
            socket.end();
        }, options.timeoutData);


        socket.id = `${socket.remoteAddress}:${socket.remotePort}`;

        socket.on('end', () => {
            debug(`${socket.id}: client socket end`);
            server.clients[socket.id].socket.destroy();
            removeClient(socket.id);
        });

        socket.on('error', err => {
            debug(`${socket.id}: ${err.message}`);
            removeClient(socket.id);
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
            const mchannel = data[attributes.channel];

            if (server._connections>(options.maxClients*2)) {
                debug(`${socket.id}: refusing connection, number of connection: ${server._connections-1}, allowed: ${options.maxClients*2}`);
                encoder.write(frame.error(mid, 'MAX_CLIENT_REACHED'));
                socket.end();
                return;
            }

            if (!mmethod) {
                debug(`${socket.id}: missing method in the payload`);
                encoder.write(frame.error(mid, 'MISSING_METHOD_ATTRIBUTE'));
                return;
            }

            if (mmethod === attributes.publish) {
                debug(`${socket.id}: pubsub: received data from channel ${mchannel}`);
                if (serverSubscribedChannels[mchannel]) {
                    serverSubscribedChannels[mchannel](mdata);
                }
                publish(mchannel, mdata);
                return;
            }

            if (mmethod === attributes.subscribe) {
                if (!clientsSubscribedChannel[mchannel]) {
                    clientsSubscribedChannel[mchannel] = [];
                }
                clientsSubscribedChannel[mchannel].push(socket.id);
                return;
            }

            if (!methods.exists(mmethod)) {
                debug(`${socket.id}: unknow method ${mmethod}`);
                encoder.write(frame.error(mid, `UNKNOW_METHOD ${mmethod}`));
                return;
            }

            if (mparams) {
                debug(`${socket.id}: method ${mmethod}: exec with params ${JSON.stringify(mparams)}`);
            } else {
                debug(`${socket.id}: method ${mmethod}: exec without params`);
            }

            RPCCall({ data, socket, encoder });
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

            debug('server started');
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
                debug(`server stopping: ending socket ${id}`);
                server.clients[id].encoder.write(JSON.stringify({ error:'SERVER_SHUTDOWN' }));
                server.clients[id].socket.end();
                server.clients[id].socket.destroy();
                removeClient(id);
                closed++;
            }
        } catch(e) {
            debug(e);
        }

        serverSubscribedChannels = {};
        clientsSubscribedChannel = {};

        if (closed) {
            debug(`${closed} socket(s) has been closed, ${closed/2} client disconnected`);
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

        if (!clientsSubscribedChannel[channel] || !clientsSubscribedChannel[channel].length) {
            debug(`pubsub: dispatch: no subscribers for channel ${channel} (server only ?)`);
            return;
        }

        let send = 0;

        async.mapValues(clientsSubscribedChannel[channel], (writerId, index, next) => {
            if (!server.clients[writerId]) {
                debug(`pubsub: dispatch error: client ${writerId} not found`);
                return;
            }

            if (!server.clients[writerId].socket) {
                debug(`pubsub: dispatch error: client ${writerId} don't have underlying socket object`);
                return;
            }

            if (!server.clients[writerId].socket.socketReader) {
                debug(`pubsub: dispatch error: client ${writerId} has no socketReader attached`);
                return;
            }

            const readerId = server.clients[writerId].socket.socketReader.socket.id;
            const reader = server.clientsReader[readerId];
            try {
                debug(`pubsub: dispatching: message sent to client ${readerId}`);
                reader.write(frame.publish(channel, data));
                send++;
            } catch(e) {
                debug(e);
            }
            next();
        }, () => {
            debug(`pubsub: dispatching: sent to ${send} clients`);
        });
    }

    function subscribe(channel, callback) {
        debug(`pubsub: server subscribe to ${channel}`);
        serverSubscribedChannels[channel] = callback;
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
