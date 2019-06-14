const Server = require('../').server;
const Client = require('../').client;

const max = 100000;
let i = 0;

const server = new Server('tls://localhost');
server.start();

// mandatory event
server.on('error', (err) => {
    throw err;
});

const client = new Client();

client.subscribe('/bla', (data) => {
    //console.log(data);
});

client.on('connected', () => {
    publishLoop();
});

const start = Date.now();

function publishLoop() {
    if (i>max) {
        const end = Date.now();
        const avg = Math.round((1000*max)/(end-start));
        console.log(`avg ${avg} msg/sec`);
        process.exit();
        return;
    }
    server.publish('/bla', { foo:'bar' });
    i++;
    setImmediate(publishLoop);
    //setTimeout(publishLoop, 1);
}
