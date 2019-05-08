const methods = require('./methods/');
const net = require('net');
const tls = require('tls');
const missive = require('missive');
const errors = require('./errors');
const debug = require('debug')('pinary:server');
const merge = require('deepmerge');
const handler = require('./methods/handler');

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
    rejectUnauthorized: false
};

function Server(options) {

    options = merge(DEFAULT_OPTIONS, options||{});

    let server;

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

        socket.setNoDelay(true);

        socket.id = `${socket.remoteAddress}:${socket.remotePort}`;

        socket.on('end', () => {
            debug(`${socket.id}: client socket end`);
            server.clients[socket.id].socket.destroy();
            delete server.clients[socket.id];
        });

        socket.on('error', err => {
            debug(`${socket.id}: ${err.message}`);
            delete server.clients[socket.id];
        });

        debug(`${socket.id}: client connected`);

        const encoder = missive.encode({ deflate: options.useZLIB });
        const decoder = missive.parse({ inflate: options.useZLIB });

        decoder.on('message', data => {

            if (server._connections>options.maxClients) {
                debug(`${socket.id}: refusing connection, number of connection: ${server._connections-1}, allowed: ${options.maxClients}`);
                encoder.write({ id: data.id, error:errors.MAX_CLIENT_REACHED });
                socket.end();
                return;
            }

            if (!data.m) {
                debug(`${socket.id}: missing method in the payload`);
                encoder.write({ id: data.id, error:'missing method attribute' });
                return;
            }

            if (!methods.exists(data.m)) {
                debug(`${socket.id}: unknow method ${data.m}`);
                encoder.write({ id: data.id, error:`unknow method ${data.m}` });
                return;
            }

            if (data.p) {
                debug(`${socket.id}: exec ${data.m} ${JSON.stringify(data.p)}`);
            } else {
                debug(`${socket.id}: exec ${data.m}`);
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

        debug(`server starting ... (${options.host}:${options.port} maxClients ${options.maxClients})`);

        methods.initialize();

        function _onServerListen(err) {

            if (err) {
                debug(err);
                throw new Error(err);
            }

            debug(`server started (maxClients ${options.maxClients})`);
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
                server.clients[id].encoder.write(JSON.stringify({ error:errors.SERVER_SHUTDOWN }));
                server.clients[id].socket.end();
                server.clients[id].socket.destroy();
                debug(`server stopping: disconnecting client ${id}`);
                closed++;
                delete server.clients[id];
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

    return { start, stop, registerMethod };
}


module.exports = Server;
