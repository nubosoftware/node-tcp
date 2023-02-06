import net from "net";
import tls from "tls";
import { NetConn } from "./netConn";
import { Logger } from "./logger";



/**
 * NetService is a TCP or TLS server that listen on a port and create a NetConn for each connection
 */
export class NetService {

    private TAG: string;
    private logger?: Logger;
    private server: net.Server | tls.Server;
    private serverType: string;
    private port: number;
    private tlsOptions?: tls.TlsOptions;
    private options?: any;
    private connClass: NetConnClass;
    private serviceName: string;
    static DEBUG = false;

    
    private listenPromise?: WaitPromise;
    private acceptPromise?: AcceptPromise;
    private acceptWaitingList: NetConn[] = [];

    /**
     * Create a new NetService
     * @param port port to listen
     * @param connClass A class that extends NetConn
     * @param tlsOptions option for tls.createServer leave undefined for tcp server
     * @param options optional options for the NetConn
     * @param logger optional logger
     */
    constructor(port: number, connClass?:NetConnClass, tlsOptions?: tls.TlsOptions,options?:any,logger?:Logger) {
        this.port = port;       
        this.tlsOptions = tlsOptions;
        this.options = options;
        this.logger = logger;
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



        const cs = this;

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
            if (NetService.DEBUG) this.log(`Listening. port: ${this.port}. serverType: ${this.serverType}`);
            
            if (this.listenPromise) {
                this.listenPromise.resolve();
                this.listenPromise = undefined;
            }
        });

        if (NetService.DEBUG) this.log(`Create ${this.serverType} server on port ${this.port}`);
    }

    /**
     * Print a log message
     * @param msg 
     */
    log(msg: string, err?: Error) {
        if (this.logger) {
            this.logger.info(`${this.TAG}: ${msg}`,err);
        } else {
            if (err) {
                console.log(`${this.TAG}: ${msg}`,err);
            } else {
                console.log(`${this.TAG}: ${msg}`);
            }
        }
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
            this.server.close();
        }
    }

    /**
     * Handle a new connection. Create a new NetConn and add event handlers
     * @param socket 
     */
    private onConnection(socket: net.Socket) {
        if (NetService.DEBUG) this.log(`HandleConnection. remoteAddress: ${socket.remoteAddress}`);
        const netConn = new this.connClass(socket,this,this.options,this.logger);
        const errorHandler = (err: any) => {
            if (NetService.DEBUG) this.log(`Connection error`, err);
        };
        const closeHandler = (err: any) => {
            if (NetService.DEBUG) this.log(`${this.TAG}: connection closed`);
            socket.end();
        };
        netConn.on("error", errorHandler);
        netConn.on("close", closeHandler)
        if (this.acceptPromise) {
            if (NetService.DEBUG) this.log(`Found acceptPromise. resolve it`);
            this.acceptPromise.resolve(netConn);
            this.acceptPromise = undefined;
        } else {
            if (NetService.DEBUG) this.log(`No acceptPromise. Add to waiting list`);
            this.acceptWaitingList.push(netConn);
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
            if (NetService.DEBUG) this.log(`Accept. acceptPromise: ${ns.acceptPromise}`);
            if (ns.acceptWaitingList.length > 0) {                
                const netConn = ns.acceptWaitingList.shift();
                if (netConn) {
                    if (NetService.DEBUG) this.log(`accept waiting list. resolve`);
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
        if (NetService.DEBUG) this.log(`onClose`);
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
        if (NetService.DEBUG) this.log(`Error`, error);
        if (this.listenPromise) {
            this.listenPromise.reject(error);
            this.listenPromise = undefined;
        }
    }
}

export type NetConnClass = {
    // tslint:disable-next-line     
    new(socket: net.Socket, server?: any, options?: any, logger?: Logger): NetConn   
}

export type WaitPromise = {
    resolve: () => void,
    reject: (error: Error) => void
};

export type AcceptPromise = {
    resolve: (conn: NetConn) => void,
    reject: (error: Error) => void
};

// module.exports = NetService;