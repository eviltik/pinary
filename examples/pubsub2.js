const Server = require('../').server;
const Client = require('../').client;

const server = new Server();
const client = new Client();

server.start();

server.subscribe('/bla', (data) => {
    console.log(data);
    setTimeout(process.exit, 200);
});

client.publish('/bla', { foo:'bar' });
