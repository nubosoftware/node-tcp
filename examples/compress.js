const { NetConn, NetService } = require('../lib/index.js');


const largeStrSize = 10000000;

/**
 * A simple handler function that will be called when a connection is accepted.
 * @param conn 
 */
const handlerFunc = async (conn) => {
    try {
        let one = await conn.readInt();
        let teststring = await conn.readString();
        await conn.writeInt(2);
        let myObj = {
            a: 1,
            b: 'test',
            c: [1, 2, 3],
            str: new Array(largeStrSize + 1).join( "#" )
        }
        await conn.writeJSON(myObj);
        await conn.flush();
    } catch (err) {
        console.log(err);
        throw err;
    }
};

async function main() {
    try {
        const port = 11481;       
        const netService = new NetService(port);
        await netService.listen();        
        console.log(`Listening on port ${port}`);
        const options = { port: port, host: 'localhost', servername: 'localhost' }
        let conn = await NetConn.connectToHost(options, false);
        console.log(`Connected to ${options.host}:${options.port}`);
        conn.setCompression(true,true); // compress both sides
        // await wait(1000);
        let serverConn = await netService.accept();
        console.log(`Accepted connection from ${serverConn.socket.remoteAddress}:${serverConn.socket.remotePort}`);
        serverConn.setCompression(true,true); // compress both sides        
        handlerFunc(serverConn); // start processing - do not await!
        await conn.writeInt(1);
        await conn.writeString('teststring');
        await conn.flush()
        console.log(`Sent data`);
        let ack = await conn.readInt();
        console.log(`Ack: ${ack}`);      
        let myObj = await conn.readJSON();
        console.log(`Received json data. Size of large string: ${myObj.str.length}`);        
        await conn.end();
        netService.close();
    } catch (err) {
        console.log(err);
        throw err;
    }
}

main();