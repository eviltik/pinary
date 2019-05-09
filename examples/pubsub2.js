const Server = require('../').server;
const Client = require('../').client;

const server = new Server();
const client = new Client();

server.start();

server.subscribe('/bla', (data) => {
    console.log(data);
    process.exit();
});

client.connect(() => {
    client.publish('/bla', { foo:'bar' });
});
