const Server = require('../').server;
const Client = require('../').client;

const server = new Server();
const client = new Client();

server.start();

client.connect(() => {
    client.subscribe('/bla', (data) => {
        console.log(data);
        process.exit();
    });

    server.publish('/bla', { foo:'bar' });
});
