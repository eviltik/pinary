const methods = {};
const methodsDescriptor = {};

function initialize() {
    methods['_getReaderId'] = require('./handlers/_getReaderId');
    methods['_setWriter'] = require('./handlers/_setWriter');
}

function getHandler(method, params, context) {
    if (!methods[method]) {
        return;
    }

    if (context) {
        return methods[method].handle.bind(context);
    } else {
        return methods[method].handle;
    }
}

function list() {
    return methods;
}

function listWithDescriptor() {
    return methodsDescriptor;
}


function exists(method) {
    if (methods[method]) {
        return true;
    }
    return false;
}

function exec(method, params, context, callback) {
    try {
        methods[method].handle(params, context, callback);
    } catch(err) {
        callback(err);
    }
}

function register(method) {
    methods[method.name] = method;
    methodsDescriptor[method.name] = method.getDescriptor();
}

module.exports = {
    initialize,
    list,
    listWithDescriptor,
    exists,
    getHandler,
    exec,
    register
};
