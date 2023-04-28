# Simple TCP and TLS classes for Node.js

 Promise (async/await) based TCP and TLS client and server for node.js.
 
 Write TCP and TLS clients and servers without the need to deal with streams and callbacks.

## Install

```bash
npm install node-tcp
 ```
 
Import classes:
```js
import { NetConn, NetService } from  "node-tcp";
```
or
```js
const { NetConn, NetService } = require("node-tcp");
```
 
 ## TCP/TLS Client
 Use `NetConn.connectToHost` to connect to a tcp/tls host and obtain the connection object. Options are the options sent to [net.connect](https://nodejs.org/api/net.html#socketconnect) or  [tls.connect](https://nodejs.org/api/tls.html#tlsconnectoptions-callback)
 ### TCP Client
 ```js
          // Connect to HTTP server (TCP)
        const options = { port: 80, host: 'www.google.com', servername: 'www.google.com' }        
        const conn = await NetConn.connectToHost(options, false);
        console.log(`Connected to ${options.host}:${options.port} using TCP`);
        // Write a simple HTTP request
        await conn.writeBuffer(Buffer.from('GET / HTTP/1.1\r\nHost: www.google.com\r\n\r\n', 'utf8'));
        console.log(`Sent data`);
        // Read response
        let data = await conn.readBuffer(undefined);
        console.log(`Received data: ${data.length} bytes`);        
        const html = data.toString('utf8');
        console.log(html);
        // Close connection
        await conn.end();   
 ```
 ### TLS Client
```js
        // Connect to Google HTTPS (TLS)
        const options2 = { port: 443, host: 'www.google.com', servername: 'www.google.com' }
        const conn2 = await NetConn.connectToHost(options2, true);
        console.log(`Connected to ${options2.host}:${options2.port} using TLS`);
        // Write a simple HTTP request
        await conn2.writeBuffer(Buffer.from('GET / HTTP/1.1\r\nHost: www.google.com\r\n\r\n', 'utf8'));
        console.log(`Sent data`);
        // Read response
        let data2 = await conn.readBuffer(undefined);
        console.log(`Received data: ${data2.length} bytes`);        
        const html2 = data2.toString('utf8');
        console.log(html2);
        // Close connection
        await conn2.end();
```

## Read and Write Data
You can read and write data in various data types:
```js
// Read/write binary buffer of 1024 bytes
const  buffer = await  conn.readBuffer(1024);
await  conn.writeBuffer(buffer);

// Read/write 32 bit integer
const  num1 = await  conn.readInt();
await  conn.writeInt(num1);

// Read/write float
const  num2 = await  conn.readFloat();
await  conn.writeFloat(num2);

// Read/write 64 bit integer
const  num3 = await  conn.readLong();
await  conn.writeLong(num3);

// Read/write string
const  string = await  conn.readString();
await  conn.writeString(string);

// Read/write object (JSON)
const  obj = await  conn.readJSON();
await  conn.writeJSON(obj);
``` 

## Timeouts
`setTimeout` sets a timeout for when the connection is idle. If the socket is idle for the specified time, the connection will be closed.
`setReadTimeout` sets a timeout for read operations. If a timeout expires before the read operation completes, the read operation is cancelled and an exception is thrown.
```js
// Set timeout for when the connection is idle
conn.setTimeout(10000); // 10 seconds
// Set timeout for read operations
conn.setReadTimeout(5000); // 5 seconds
```

## TCP Server
There are two options to implement TCP Server using `NetService` 
### Option 1 - Handler function
Accept a new connection on a loop and send each connection to a handler function. The main server function should not `await` the handler function so the server can handle multiple concurrent connections. 
```js
/**
* Example for a handler function, called when a connection is accepted
* @param  {*}  conn Connection object
*/
async  function  handlerFunc(conn) {
	try {
		let  one = await  conn.readInt();
		let  teststring = await  conn.readString();
		await  conn.writeInt(2);
		let  myObj2 = await  conn.readJSON();
		console.log(myObj2);	
	} catch (err) {
		console.log(err);
	}
};
/**
* Example server
*/
async  function  mainServer() {
	try {
		const  port = 11481;
		netService = new  NetService(port,NetConn);
		// listen for connections
		await  netService.listen();
		console.log(`Listening on port ${port}`);
		let  serverConn;
		// accept connections
		while (serverConn = await  netService.accept()) {
			console.log(`Accepted connection from ${serverConn.socket.remoteAddress}:${serverConn.socket.remotePort}`);
			handlerFunc(serverConn); // start handler - do not await!
		}
	} catch (err) {
		console.log(err);
	}
}
```
### Option 2 - Extend `NetConn` class 
Create a class that extends the `NetConn` and overrides the constructor. When the constructor called start a handler function.
When creating the  `NetService`  object, reference your class.
```js
let netService;

/**
 * Example for a server connection class - This class extends NetConn and adds
 * call to processData() in the constructor. This is where you would
 * implement your server connection logic.
 */
class ExampleServerConn extends NetConn {
    constructor(socket, server, options, logger) {
        super(socket, server, options, logger);
        console.log(`TestServerConn: connected to ${socket.remoteAddress}:${socket.remotePort}`);       
        this.processData();
    }
    async processData() {
        try {        
            const conn = this;
            let one = await conn.readInt();      
            let teststring = await conn.readString();       
            await conn.writeInt(2);
            let myObj = {
                a: 1,
                b: 'test',
                c: [1, 2, 3]
            }
            await conn.writeJSON(myObj);
            let myObj2 = await conn.readJSON();
            console.log(myObj2);
            if (myObj2.command === 'quit') {
                netService.close();
            }
        } catch (err) {
            console.log(err);       
        }
    }
}

/**
 * Example server
 */
async function mainServer() {
    try {
        const port = 11481;
        // create server, passing in connection class
        netService = new NetService(port,ExampleServerConn);
        // listen for connections
        await netService.listen();
        console.log(`Listening on port ${port}`);       
    } catch (err) {
        console.log(err);
    }
}
```
## TLS Server
Implement TLS server exactly the same as TCP Server, but add TLS options to NetService arguments
```js
        // create server, passing in port, connection class, and TLS options
        const tlsOptions = {
            key: await fs.promises.readFile('server.key'),
            cert: await fs.promises.readFile('server.crt')
        };        
        const port = 11443;
        netService = new NetService(port,ExampleServerConn,tlsOptions);
        // listen for connections
        await netService.listen();
        console.log(`Listening on port ${port} using TLS`);
```
## Examples
Examples of java script files are available in the [examples folder](https://github.com/nubosoftware/node-tcp/tree/main/examples)

The `json-server.js` and `json-client.js` demonstrate server and client that communicate with JSON messages. 
This will help you to implement a very simple protocol for asynchronous communication between client and server.