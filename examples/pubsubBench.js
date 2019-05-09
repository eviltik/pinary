const Server = require('../').server;
const Client = require('../').client;

let i = 0;

const server = new Server();
server.start();

// mandatory event
server.on('error', (err) => {
    throw err;
});

const client = new Client();
client.connect(() => {
    client.subscribe('/bla', (data) => {
        //console.log(data);
    });

    console.time('p');
    publishLoop();

});

function publishLoop() {
    if (i>100000) {
        console.timeEnd('p');
        process.exit();
        return;
    }
    server.publish('/bla', { foo:'bar', i });
    i++;
    setImmediate(publishLoop);
    //setTimeout(publishLoop, 1);
}
