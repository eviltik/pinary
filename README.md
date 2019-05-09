# pinary

[![Build Status](https://secure.travis-ci.org/eviltik/pinary.png)](http://travis-ci.org/eviltik/pinary)
[![Dependencies](https://david-dm.org/eviltik/pinary.svg)](https://david-dm.org/eviltik/pinary)
[![npm version](https://badge.fury.io/js/pinary.svg)](https://badge.fury.io/js/pinary)
[![Licence](https://badges.frapsoft.com/os/mit/mit.svg?v=102)](https://github.com/ellerbrock/open-source-badge/)


## Introduction

Yet another JSONRPC client/server

* Use TCP or TLS (under the hood, 2 sockets are used, i.e writer and reader)
* Binary frames
* Optional ZLIB compression
* Minimalistic JSON Schema implementation
* Handle Max Clients
* Support callback, promises and async/await syntax
* Client automatic reconnect

## Install

```
npm install pinary
```

## Server

### Server: instantiation

```
const PinaryServer = require('pinary').server;
const server = new PinaryServer();

// with options (see below)
// const server = new PinaryServer({port:64000});

```

| Option                | Default                       |  Notes  
|-----------------------|-------------------------------|----------------
| useTLS                | false                         | Use clear TCP or TLS    
| useZLIB               | false                         | Use ZLIB compression
| maxClients            | 10                            | Maximum number of simultaneous TCP connections
| timeoutData           | 1000                          | Delay before socket close if no data sent, in milliseconds
| host                  | 0.0.0.0                       | Listening IP/host
| port                  | 65000 for TCP, 65001 for TLS  | Listening port
| key                   | null                          | TLS: private key
| cert                  | null                          | TLS: public key
| ca                    | null                          | TLS: certificate authority (string of array of string)
| secureProtocol        | TLSv1_2_method                | TLS: cipher
| rejectUnauthorized    | false                         | TLS: allow self signed certificates, or not

## Client

### Client: instantiation
```
const PinaryClient = require('pinary').client;
const client = new PinaryClient();

// with a TCP url
// const client = new PinaryClient('tcp://localhost:64000',[options]);

// with a TLS url
// const client = new PinaryClient('tls://localhost:64000',[options]);
```
| Option                                | Default                       | Note |      
|---------------------------------------|-------------------------------|------|
| reconnectInterval                     | 500                           | milliseconds   |
| reconnectMaxAttempts                  | 5                             |                |
| reconnectWaitAfterMaxAttempsReached   | 2000                          | milliseconds   |

### Client: connecting to the server
```
// connect using callback
client.connect(err => {
    if (err) throw err;
    console.log('connected');
});

// connect using async/await
async function() {
    try {
        await client.connect();
    } catch(e) {
        throw err;
    }
}

```

### Client: trigger a method

```
// using callback
client.method('myMethod', (err, result) => {
    if (err) throw err;
    console.log(result);
});

// using async/await
async function letsgo() {
    let result;
    try {
        result = await client.method('myMethod');
    } catch(e) {
        // something wrong
    }
    console.log(result);
}
```

## TODO
* promises tests
* finish doc
  * emitter events (both client and server)
  * server methods registration (see test/tests/102.methodExist.js for moment)
