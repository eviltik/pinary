
const errors = {
    MAX_CLIENT_REACHED:{
        code: -32000,
        message:'Max Clients Reached'
    },
    SERVER_SHUTDOWN:{
        code: -32001,
        message:'Server shutdown'
    },

    // http://jsonrpc.org/spec.html#error_object
    ERROR_CODE_PARAMETER: -32602,
    ERROR_CODE_INTERNAL: -32603,
};

module.exports = errors;
