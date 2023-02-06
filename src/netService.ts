import net from "net";
import tls from "tls";
import { NetConn } from "./netConn";
import debug from "debug";

const log = debug ("node-tcp:netService");


/**
 * NetService is a TCP or TLS server that listen on a port and create a NetConn for each connection
 */
export class NetService {

    private TAG: string;
    private server: net.Server | tls.Server;
    private serverType: string;
    private port: number;
    private tlsOptions?: tls.TlsOptions;
    private options?: any;
    private connClass: NetConnClass;
    private serviceName: string;


    
    private listenPromise?: WaitPromise;
    private acceptPromise?: AcceptPromise;
    private acceptWaitingList: NetConn[] = [];
    private isClientAcceptConnections: boolean = false;

    log: debug.Debugger;

    /**
     * Create a new NetService
     * @param port port to listen
     * @param connClass A class that extends NetConn
     * @param tlsOptions option for tls.createServer leave undefined for tcp server
     * @param options optional options for the NetConn
     */
    constructor(port: number, connClass?:NetConnClass, tlsOptions?: tls.TlsOptions,options?:any) {
        this.port = port;       
        this.tlsOptions = tlsOptions;
        this.options = options;       
        if (!connClass) {
            connClass = NetConn;
        }
        this.connClass = connClass;       
        this.serviceName = `${connClass.name}Service`;        
        if (tlsOptions) {            
            this.tlsOptions = tlsOptions;
            this.server = tls.createServer(tlsOptions);
            this.serverType = "tls";
        } else {
            this.server = net.createServer();
            this.serverType = "tcp";
        }
        this.TAG = `${this.serviceName}_${this.serverType}_${this.port}`;
        this.log = debug (`node-tcp:netService:${this.TAG}`);        
        const cs = this;

        if (connClass.name === "NetConn") {            
            this.log(`NetConn is the connClass. Set isClientAcceptConnections to true`);
            this.isClientAcceptConnections = true;
        }

        if (this.serverType === "tcp") {
            this.server.on('connection', (socket) => {
                cs.onConnection(socket);
            });
        } else {
            this.server.on('secureConnection', (socket) => {
                cs.onConnection(socket);
            });
        }
        this.server.on('close', () => {
            cs.onClose();
        });
        this.server.on('error', (error) => {
            cs.onError(error);
        });

        this.server.on('listening', () => {
            const addr = this.server.address();
            if (addr && typeof addr !== "string") {
                this.port = addr.port;
                this.TAG = `${this.serviceName}_${this.serverType}_${this.port}`;
            }            
            cs.log(`Listening. port: ${this.port}. serverType: ${this.serverType}`);           
            
            if (this.listenPromise) {
                this.listenPromise.resolve();
                this.listenPromise = undefined;
            }
        });

        cs.log(`Create ${this.serverType} server on port ${this.port}`);
    } 

    /**
     * Listen for connections
     * @returns A promise that resolves when the server is listening
     */
    listen(options?: net.ListenOptions): Promise<void> {
        const ns = this;
        if (options && !options.port) {
            options.port = this.port;
            this.server.listen(options);
        } else {
            this.server.listen(this.port);
        }        
        return new Promise<void>((resolve, reject) => {
            ns.listenPromise = {
                resolve,
                reject
            };
        });
    }

    /**
     * Close the server and stop listening for connections
     */
    close() {
        if (this.server) {
            this.log(`Close server`);
            this.server.close();
        }
    }

    /**
     * Handle a new connection. Create a new NetConn and add event handlers
     * @param socket 
     */
    private onConnection(socket: net.Socket) {
        this.log(`HandleConnection. remoteAddress: ${socket.remoteAddress}`);
        const netConn = new this.connClass(socket,this,this.options);
        const errorHandler = (err: any) => {
            this.log(`Connection error`, err);
        };
        const closeHandler = (err: any) => {
            this.log(`${this.TAG}: connection closed`);
            socket.end();
        };
        netConn.on("error", errorHandler);
        netConn.on("close", closeHandler)
        if (this.acceptPromise) {
            this.log(`Found acceptPromise. resolve it`);
            this.acceptPromise.resolve(netConn);
            this.acceptPromise = undefined;
        } else if (this.isClientAcceptConnections) {
            this.log(`No acceptPromise. Add to waiting list`);
            this.acceptWaitingList.push(netConn);
        } else {
            this.log(`Client is not accepting connections. Expecting extended NetConn class to handle connection`);
        }
    }

    /**
     * Accept a connection. If there is a connection waiting in the acceptWaitingList return it
     * otherwise return a promise that resolves when a connection is made
     * @returns A promise that resolves to a NetConn
     */
    accept(): Promise<NetConn> {
        const ns = this;
        return new Promise<NetConn>((resolve, reject) => {
            ns.acceptPromise = {
                resolve,
                reject
            };
            this.log(`Accept. acceptPromise: ${ns.acceptPromise}`);
            if (ns.acceptWaitingList.length > 0) {                
                const netConn = ns.acceptWaitingList.shift();
                if (netConn) {
                    this.log(`accept waiting list. resolve`);
                    ns.acceptPromise.resolve(netConn);
                    ns.acceptPromise = undefined;
                }
            }
        });
    }

    /**
     * Handle server close event
     */
    onClose() {
        this.log(`onClose`);
        if (this.listenPromise) {
            this.listenPromise.reject(new Error("Server closed"));
            this.listenPromise = undefined;
        }
        if (this.acceptPromise) {
            this.acceptPromise.reject(new Error("Server closed"));
            this.acceptPromise = undefined;
        }
    }

    /**
     * Handle server error event. If there is a listenPromise reject it
     * @param error 
     */
    onError(error: any) {
        this.log(`Error`, error);
        if (this.listenPromise) {
            this.listenPromise.reject(error);
            this.listenPromise = undefined;
        }
    }
}

export type NetConnClass = {
    // tslint:disable-next-line     
    new(socket: net.Socket, server?: any, options?: any): NetConn   
}

export type WaitPromise = {
    resolve: () => void,
    reject: (error: Error) => void
};

export type AcceptPromise = {
    resolve: (conn: NetConn) => void,
    reject: (error: Error) => void
};