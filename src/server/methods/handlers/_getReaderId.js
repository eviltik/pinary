const debug = require('debug')('pinary:server');
const handler = require('../handler');

const descriptor = {
    name:'_getReaderId',
    description:'Set a TCP connexion as a reader, return an reader id',
};

function handle(params, context, callback) {
    const uniqId = Date.now();
    context.session.server.clients[context.session.id].readerId = uniqId;
    context.session.server.clientsReader[context.session.id] = context.session.server.clients[context.session.id].encoder;

    context.session.readerId = uniqId;
    debug(`client ${context.session.id}: registered as a reader (${uniqId})`);
    callback(null, uniqId);
}

module.exports = new handler.Method(descriptor, handle);
