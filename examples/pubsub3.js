const Server = require('../').server;
const Client = require('../').client;

const server = new Server();
const client1 = new Client();
const client2 = new Client();

server.start();

client1.connect(() => {

    client1.subscribe('/bla', (data) => {
        console.log(data);
        process.exit();
    });

    client2.connect(() => {
        client2.publish('/bla', { foo:'bar' });
    });
});
