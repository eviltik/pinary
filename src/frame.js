const attributes = require('./attributes');

function error(id, error) {
    const frame = {};
    frame[attributes.id] = id;
    frame[attributes.error] = error;
    return frame;
}

function result(id, result) {
    const frame = {};
    frame[attributes.id] = id;
    frame[attributes.result] = result;
    return frame;
}

function publish(channel, data) {
    const frame = {};
    frame[attributes.method] = attributes.publish;
    frame[attributes.channel] = channel;
    frame[attributes.data] = data;
    return frame;
}

function subscribe(channel) {
    const frame = {};
    frame[attributes.method] = attributes.subscribe;
    frame[attributes.channel] = channel;
    return frame;
}

module.exports = {
    error,
    result,
    publish,
    subscribe
};
