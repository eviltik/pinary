const Server = require('../').server;
const Client = require('../').client;

const server = new Server();
server.start();

// mandatory event
server.on('error', (err) => {
    throw err;
});

const client = new Client();
client.connect(() => {
    client.subscribe('/bla', (data) => {
        console.log(data);
        process.exit();
    });

    server.publish('/bla', { foo:'bar' });

});
