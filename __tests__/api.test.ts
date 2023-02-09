import { NetService } from '../src/netService';
import { NetConn } from '../src/netConn';
import net from 'net';

const largeStrSize = 10000000;

class TestServerConn extends NetConn {
    constructor(socket: net.Socket, server?: any, options?: any) {
        super(socket, server, options);
        console.log(`TestServerConn: connected to ${socket.remoteAddress}:${socket.remotePort}`);
        expect(socket).toBeDefined();
        this.processData();
    }
    async processData() {
        try {
            let one = await this.readInt();
            expect(one).toBe(1);
            let teststring = await this.readString();
            expect(teststring).toBe('teststring');
            await this.writeInt(2);
            let myObj = {
                a: 1,
                b: 'test',
                c: [1, 2, 3],
                str: new Array(largeStrSize + 1).join( "#" )
            }
            await this.writeJSON(myObj);
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
}

// basic test just chek that the classes are defined
test('Basic Test', () => {
    expect(NetConn).toBeDefined();
    expect(NetService).toBeDefined();
});

/**
 * Test a simple tcp connection. Connect to google.com:443 and send a simple http request
 * and check that we get a response.
 */
test('Simple Https', async () => {
    try {
        const options = { port: 443, host: 'www.google.com', servername: 'www.google.com' }
        let conn: NetConn = await NetConn.connectToHost(options, true);
        console.log(`Connected to ${options.host}:${options.port}`);
        await conn.writeBuffer(Buffer.from('GET / HTTP/1.1\r\nHost: www.google.com\r\n\r\n', 'utf8'));
        console.log(`Sent data`);
        let data = await conn.readBuffer(undefined);
        console.log(`Received data: ${data.length} bytes`);
        const html = data.toString('utf8');
        await conn.end();
        expect(data).toBeDefined();
        expect(data.length).toBeGreaterThan(0);
        expect(html).toContain('<!doctype html>');
    } catch (err) {
        console.log(err);
        throw err;
    }
});

/**
 * Test both client and server. Start a server and connect to it.
 * The server will send a json object and the client will check that it is correct.
 * The server connection in implemented in the TestServerConn class.
 */
test('Client and Server', async () => {
    try {
        const port = 11480;
        const netService = new NetService(port, TestServerConn, undefined, undefined);
        await netService.listen();
        console.log(`Listening on port ${port}`);
        const options = { port: port, host: 'localhost', servername: 'localhost' }
        let conn: NetConn = await NetConn.connectToHost(options, false);
        console.log(`Connected to ${options.host}:${options.port}`);
        await conn.writeInt(1);
        await conn.writeString('teststring');
        console.log(`Sent data`);
        let ack = await conn.readInt();
        console.log(`Ack: ${ack}`);
        expect(ack).toBe(2);
        let myObj = await conn.readJSON();
        console.log(`Received data: myObj`);
        expect(myObj).toBeDefined();
        expect(myObj.a).toBe(1);
        expect(myObj.b).toBe('test');
        expect(myObj.c).toBeDefined();
        expect(myObj.c.length).toBe(3);
        expect(myObj.str).toBeDefined();
        expect(myObj.str.length).toBe(largeStrSize);
        await conn.end();
        netService.close();
    } catch (err) {
        console.log(err);
        throw err;
    }
});

/**
 * A simple handler function that will be called when a connection is accepted.
 * @param conn 
 */
const handlerFunc = async (conn: NetConn) => {
    try {
        let one = await conn.readInt();
        expect(one).toBe(1);
        let teststring = await conn.readString();
        expect(teststring).toBe('teststring');
        await conn.writeInt(2);
        let myObj = {
            a: 1,
            b: 'test',
            c: [1, 2, 3]
        }
        await conn.writeJSON(myObj);
    } catch (err) {
        console.log(err);
        throw err;
    }
};


/**
 * Wait for a number of milliseconds
 * @param ms 
 * @returns 
 */
function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test both client and server. Start a server and connect to it.
 * The server will send a json object and the client will check that it is correct.
 * The server connection in implemented in the handlerFunc function.
 */
test('Client and Server with accept', async () => {
    try {
        const port = 11481;
        // NetService.DEBUG = true;
        const netService = new NetService(port);
        await netService.listen();        
        console.log(`Listening on port ${port}`);
        const options = { port: port, host: 'localhost', servername: 'localhost' }
        let conn: NetConn = await NetConn.connectToHost(options, false);
        console.log(`Connected to ${options.host}:${options.port}`);
        // await wait(1000);
        let serverConn = await netService.accept();
        console.log(`Accepted connection from ${serverConn.socket.remoteAddress}:${serverConn.socket.remotePort}`);        
        handlerFunc(serverConn); // start processing - do not await!
        await conn.writeInt(1);
        await conn.writeString('teststring');
        console.log(`Sent data`);
        let ack = await conn.readInt();
        console.log(`Ack: ${ack}`);
        expect(ack).toBe(2);
        let myObj = await conn.readJSON();
        console.log(`Received data: ${JSON.stringify(myObj)}`);
        expect(myObj).toBeDefined();
        expect(myObj.a).toBe(1);
        expect(myObj.b).toBe('test');
        expect(myObj.c).toBeDefined();
        expect(myObj.c.length).toBe(3);
        await conn.end();
        netService.close();
    } catch (err) {
        console.log(err);
        throw err;
    }
});


