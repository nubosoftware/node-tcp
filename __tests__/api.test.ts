
import { NetService } from '../src/netService';
import { NetConn } from '../src/netConn';
import net from 'net';
import { Logger } from '../src/logger';



class TestServerConn extends NetConn {
    constructor(socket: net.Socket, server?: any, options?: any, logger?: Logger) {
        super(socket, server, options, logger);
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
                c: [1, 2, 3]
            }
            await this.writeJSON(myObj);
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
}

// basic test without initialization of coreModule
test('Basic Test', () => {
    expect(NetConn).toBeDefined();
    expect(NetService).toBeDefined();
});

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

test('Client and Server', async () => {
    try {
        const port = 11480;
        const netService = new NetService(port, TestServerConn, undefined, undefined, undefined);
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


