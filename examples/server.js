const Server = require('../').server;
const Client = require('../').client;

const server = new Server();
server.start();

// mandatory event
server.on('error', (err) => {
    throw err;
});

server.registerMethod(
    {
        name:'test2',
        properties:{
            'foo':{
                description:'field example',
                type:'string'
            }
        },
        required:['foo']
    },
    (params, context, callback) => {
        callback(null, 'you pass '+JSON.stringify(params));
    }
);

const client = new Client();
client.connect();

// no callback, test1 is not a registered method,
// fail silently (because no callback)
console.log('calling rpc "test1"');
client.rpc('test1', { foo:'bar' });

// callback, test2 is a registered method
console.log('calling rpc "test2"');
client.rpc('test2', { foo:'bar' }, (err, result) => {
    if (err) console.log(err);
    console.log(result);
});

// async/await, test3 is not a registered method
(async function test() {
    try {
        console.log('calling rpc "test3"');
        await client.rpcPromise('test3');
    } catch(e) {
        console.log(e);
    }

    // clean exit (not mandatory)
    client.close(process.exit);
})();
