const { NetConn, NetService } = require('../lib/index.js');
const fs = require('fs');

/**
 * Example server implementation. Some options are commented out.
 */

let netService;

/**
 * Example server connection class. This class extends NetConn and adds
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

// /**
//  * Example TLS server
//  */
// async function mainServer() {
//     try {
        
//         // create server, passing in port, connection class, and TLS options
//         const tlsOptions = {
//             key: await fs.promises.readFile('server.key'),
//             cert: await fs.promises.readFile('server.crt')
//         };        
//         const port = 11443;
//         netService = new NetService(port,ExampleServerConn,tlsOptions);
//         // listen for connections
//         await netService.listen();
//         console.log(`Listening on port ${port} using TLS`);       
//     } catch (err) {
//         console.log(err);
//     }
// }




/**
 * Example handler function, called when a connection is accepted
 * @param {*} conn Connection object
 */
 async function handlerFunc(conn) {
    try {        
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
};

// /**
//  * Example server with handler function
//  */
// async function mainServer() {
//     try {
//         const port = 11481;       
//         netService = new NetService(port,NetConn);
//         // listen for connections
//         await netService.listen();
//         console.log(`Listening on port ${port}`);                            
//         let serverConn;
//         // accept connections
//         while (serverConn = await netService.accept()) {
//             console.log(`Accepted connection from ${serverConn.socket.remoteAddress}:${serverConn.socket.remotePort}`);
//             handlerFunc(serverConn); // start handler - do not await!
//         }          
//     } catch (err) {
//         console.log(err);
//     }
// }




mainServer();