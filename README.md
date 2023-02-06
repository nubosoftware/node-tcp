


# Simple TCP and TLS classes for Node.js

 Promise (async/await) based TCP and TLS client and server for node.js
Write TCP and TLS clients and servers without the need to deal with streams and callbacks

## Install

```bash
npm install node-tcp
 ```
 
Import classes:
```
import { NetConn, NetService } from  "node-tcp";
```
or
```
const { NetConn, NetService } = require("node-tcp");
```
 
 ## TCP/TLS Client
 use `NetConn.connectToHost` to connect to a tcp/tls host and obtain the connection object. options are the options sent to [net.connect](https://nodejs.org/api/net.html#socketconnect) or  [tls.connect](https://nodejs.org/api/tls.html#tlsconnectoptions-callback)
```js
// Connect to Google HTTPS
const  options = { port:  443, host:  'www.google.com', servername:  'www.google.com' }
const  conn = await  NetConn.connectToHost(options, true);
```

## Read data
You can read data in various data types:
```js
// Read data from the server
// This will wait until the server sends data

// Read binary buffer of 1024 bytes
const  buffer = await  conn.readBuffer(1024);

// Read integer
const  num1 = await  conn.readInt();

// Read float
const  num2 = await  conn.readFloat();

// Read 64 bit integer
const  num3 = await  conn.readLong();

// Read string
const  string = await  conn.readString();

// Read object (JSON)
const  obj = await  conn.readJSON();
``` 
