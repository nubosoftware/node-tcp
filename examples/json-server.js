const { NetConn, NetService } = require('../lib/index.js');


/**
 * Example server connection class that processes JSON messages.
 * Each JSON message is an object with a command property.
 * The command property is used to determine what action to take.
 * You can add your own commands here and implement a very simple protocol
 * for asynchronous communication between client and server.
 * You can check this with the client example in examples/json-client.js
 */
class JSONServerConn extends NetConn {
    constructor(socket, server, options, logger) {
        super(socket, server, options, logger);
        console.log(`JSONServerConn: connected to ${socket.remoteAddress}:${socket.remotePort}`);       
        this.processData();
    }
    async processData() {
        try {        
            const conn = this;
            while (true) {
                let packet = await conn.readJSON();
                console.log(`Received packet: ${JSON.stringify(packet)}`);
                if (packet.command === 'quit-server') {
                    console.log('Received quit-server command. Close server.');
                    await conn.writeJSON({command: 'quit-server', status: 'ok'});
                    await conn.end();
                    netService.close();
                    break;
                } else if (packet.command === 'quit') {
                    console.log('Received quit command. Close connection.');
                    await conn.writeJSON({command: 'quit', status: 'ok'});
                    await conn.end();
                    break;
                } else if (packet.command === 'echo') {
                    console.log('Received echo command. Echoing back.');
                    await conn.writeJSON({command: 'echo', status: 'ok', data: packet.data});
                } else if (packet.command === 'date') {
                    console.log('Received date command. Sending date.');
                    await conn.writeJSON({command: 'date', status: 'ok', date: new Date()});
                } else if (packet.command === 'command-list') {
                    console.log('Received command-list command. Sending command list.');
                    await conn.writeJSON({command: 'command-list', status: 'ok', commands: ['quit-server', 'quit', 'echo', 'date', 'command-list']});
                } else {
                    console.log('Received unknown command. Sending error.');
                    await conn.writeJSON({command: 'error', status: 'error', message: 'Unknown command'});
                }
            }            
        } catch (err) {
            console.log(err);       
        }
    }
}

/**
 * Instance of NetService
 */
var netService;

/**
 * Example server
 */
async function mainServer() {
    try {
        const port = 11481;
        // create server, passing in connection class
        netService = new NetService(port,JSONServerConn);
        // listen for connections
        await netService.listen();
        console.log(`Listening on port ${port}`);       
    } catch (err) {
        console.log(err);
    }
}

mainServer();