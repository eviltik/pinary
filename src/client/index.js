const implementedTransports = [
    'tcp',
    'tls',
];

function Client(url, options) {

    if (!url) {
        url = 'tcp://localhost';
    }

    const e = url.match(/^([^:]+)/);
    if (!e) {
        throw new Error(`endpoint must start with ${implementedTransports.join(',')}`);
    }

    options = options||{};

    options.protocol = e[1].toLowerCase();
    if (implementedTransports.indexOf(options.protocol)<0) {
        throw new Error(`endpoint does not contain any implemented protocol ${implementedTransports.join(',')}`);
    }

    if (options.protocol === 'tcp') {
        options.protocol = 'dinary';
    }

    if (options.protocol === 'tls') {
        options.protocol = 'dinarys';
    }

    url = url.replace(/^[^:]+:\/\//, '').split(':');
    const host = url[0];
    const port = parseInt(url[1]);

    const MyClient = require('./dinary');

    return new MyClient(port, host, options);

}

module.exports = Client;
