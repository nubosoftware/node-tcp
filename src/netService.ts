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

    
    private waitPromise?: WaitPromise;

    /**
     * Create a new NetService
     * @param port port to listen
     * @param connClass A class that extends NetConn
     * @param tlsOptions option for tls.createServer leave undefined for tcp server
     * @param options optional options for the NetConn
     * @param logger optional logger
     */
    constructor(port: number, connClass:NetConnClass, tlsOptions?: tls.TlsOptions,options?:any,logger?:Logger) {
        this.port = port;       
        this.tlsOptions = tlsOptions;
        this.options = options;
        this.logger = logger;
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
            
            if (this.waitPromise) {
                this.waitPromise.resolve();
                this.waitPromise = undefined;
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
            console.log(`${this.TAG}: ${msg}`,err);
        }
    }

    /**
     * Listen for connections
     * @returns A promise that resolves when the server is listening
     */
    listen(): Promise<void> {
        const ns = this;
        this.server.listen(this.port);
        return new Promise((resolve, reject) => {
            ns.waitPromise = {
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
    }

    /**
     * Handle server close event
     */
    onClose() {
        if (NetService.DEBUG) this.log(`onClose`);        
    }

    /**
     * Handle server error event. If there is a waitPromise reject it
     * @param error 
     */
    onError(error: any) {
        if (NetService.DEBUG) this.log(`Error`, error);
        if (this.waitPromise) {
            this.waitPromise.reject(error);
            this.waitPromise = undefined;
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

// module.exports = NetService;