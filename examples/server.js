const Server = require('../').server;
const Client = require('../').client;

const client = new Client();
client.connect();
client.method('test');


const server = new Server();
server.start();

server.on('error', (err) => {
    console.log(err);
});
