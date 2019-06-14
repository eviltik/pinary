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

client.rpc('test2', { foo:'bar' }, (err, result) => {
    if (err) console.log(err);
    console.log(result);
    client.close(process.exit);
});
