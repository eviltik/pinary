let server;

const descriptor = {
    title:'myMethod',
    description:'Test method'
};

function handle(params, context, callback) {
    //console.log(context.session.id);
    setTimeout(() => {
        callback(null, true);
    }, 200);
}

module.exports = (pinaryServer) => {
    server = pinaryServer;
    server.registerMethod(descriptor, handle);
};
