const { NetConn } = require('../lib/index.js');

/**
 * Example client
 * Connect to server, send data, and receive data
 * Also send command line argument as JSON
 * If command line argument is 'quit', close server
 */
async function mainClient() {
    try {
        const port = 11481;
        const options = { port: port, host: 'localhost', servername: 'localhost' }
        let conn = await NetConn.connectToHost(options, false);
        console.log(`Connected to ${options.host}:${options.port}`);
        await conn.writeInt(1);
        await conn.writeString('teststring');
        console.log(`Sent data`);
        let ack = await conn.readInt();
        console.log(`Ack: ${ack}`);
        let myObj = await conn.readJSON();
        console.log(`Received data: ${JSON.stringify(myObj)}`);

        let myObj2 = {
            command: process.argv[2] || 'test',
        }
        await conn.writeJSON(myObj2);
        await conn.end();
    } catch (err) {
        console.log(err);
    }
}

mainClient();