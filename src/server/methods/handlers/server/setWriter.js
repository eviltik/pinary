const debug = require('debug')('pinary:server:methods:writer');
const handler = require('../../handler');

const descriptor = {
    title:'setWriter',
    description:'Set a TCP connexion as a writer',
    type:'object',
    properties:{
        'readerId':{
            description:'socket reader uniq id',
            type:'number'
        }
    },
    required:['readerId']
};

function handle(params, context, callback) {

    let socketReader;
    let socketReaderId;
    for (const clientId in context.session.server.clients) {
        if (context.session.server.clients[clientId].readerId === params.readerId) {
            socketReader = context.session.server.clients[clientId];
            socketReaderId = clientId;
        }
    }

    if (!socketReader) {
        callback(handler.internalError(`socket reader id ${params.readerId} not found`));
        return;
    }

    debug(`${context.session.id}: writer linked with reader ${socketReaderId}`);
    context.session.socketReader = socketReader;
    callback(null, true);
}

module.exports = new handler.Method(descriptor, handle);
