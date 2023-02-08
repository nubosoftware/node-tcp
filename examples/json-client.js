const { NetConn } = require('../lib/index.js');

/**
 * Example client that connects to JSON server. The JSON server is implemented in examples/json-server.js
 * This client sends command line arguments as JSON messages
 * Each JSON message is an object with a command property.
 * The command property is used to determine what action to take.
 * Each command is processed by the server and a response is sent back.
 */
async function mainClient() {
    try {
        const port = 11481;
        const options = { port: port, host: 'localhost', servername: 'localhost' }
        let conn = await NetConn.connectToHost(options, false);
        console.log(`Connected to ${options.host}:${options.port}`);
        for (let i = 2; i < process.argv.length; i++) {
            const command = process.argv[i];
            console.log(`Sending command: ${command}`);
            let obj = {
                command: command
            }
            if (command === "echo") {
                obj.data = "test";
            }
            await conn.writeJSON(obj);
            console.log(`Sent command: ${command}`);
            let response = await conn.readJSON();
            console.log(`Received response: ${JSON.stringify(response)}`);
        }        
        await conn.end();
    } catch (err) {
        console.log(err);
    }
}

if (process.argv.length < 3) {
    console.log("Usage: node json-client.js command1 command2 ...");
    console.log("Commands: quit-server, quit, echo, date, command-list");
    process.exit(1);    
}
mainClient();