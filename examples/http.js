const { NetConn } = require('../lib/index.js');


/**
 * Example client. Connect to HTTP server and send simple HTTP request.
 * Connect to HTTPS server and send simple HTTPS request.
 */
async function mainClient() {
    try {

        // Connect to HTTP server (TCP)
        const options = { port: 80, host: 'www.google.com', servername: 'www.google.com' }        
        const conn = await NetConn.connectToHost(options, false);
        console.log(`Connected to ${options.host}:${options.port} using TCP`);
        // Write simple HTTP request
        await conn.writeBuffer(Buffer.from('GET / HTTP/1.1\r\nHost: www.google.com\r\n\r\n', 'utf8'));
        console.log(`Sent data`);
        // Read response
        let data = await conn.readBuffer(undefined);
        console.log(`Received data: ${data.length} bytes`);        
        const html = data.toString('utf8');
        console.log(html);
        // Close connection
        await conn.end();

        // Connect to Google HTTPS (TLS)
        const options2 = { port: 443, host: 'www.google.com', servername: 'www.google.com' }
        const conn2 = await NetConn.connectToHost(options2, true);
        console.log(`Connected to ${options2.host}:${options2.port} using TLS`);
        // Write simple HTTP request
        await conn2.writeBuffer(Buffer.from('GET / HTTP/1.1\r\nHost: www.google.com\r\n\r\n', 'utf8'));
        console.log(`Sent data`);
        // Read response
        let data2 = await conn.readBuffer(undefined);
        console.log(`Received data: ${data2.length} bytes`);        
        const html2 = data2.toString('utf8');
        console.log(html2);
        // Close connection
        await conn2.end();




    } catch (err) {
        console.log(err);
    }
}

mainClient();