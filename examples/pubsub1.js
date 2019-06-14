const Server = require('../').server;
const Client = require('../').client;

const server = new Server();
const client = new Client();

server.start();

client.subscribe('/bla', (data) => {
    console.log(data);
    process.exit();
});

setTimeout(() => {
    server.publish('/bla', { foo:'bar' });
}, 100);
