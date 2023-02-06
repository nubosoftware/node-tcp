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

## Read and Write data
You can read and write data in various data types:
```js
// Read/write binary buffer of 1024 bytes
const  buffer = await  conn.readBuffer(1024);
await  conn.writeBuffer(buffer);

// Read/write integer
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

## TCP Server
There are two options to implement TCP Server using `NetService` 
### Option 1 - Handler function
Accept new connection on a loop and send each connection to an handler function. The main server function should not `await` the handler function so the server can handle multiple concurrent connections. 
```js
/**
* Example handler function, called when a connection is accepted
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
### Option 2 - Extent `NetConn` class 
Create a class that extend the `NetConn` and override the constructor. When the constructor called start a handler function in that connection class.
When creating the  `NetService`  object, reference your class.