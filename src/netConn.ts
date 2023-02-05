"use strict";

import net from "net";
import tls from "tls";
import { EventEmitter } from "events";
import { SequentialTaskQueue } from "sequential-task-queue";
import { Logger } from "./logger";


const COMPRESSION_BUFFER_SIZE = 64000;

type BWStats = {
    addInBytes: (bytes: number) => void;
    addOutBytes: (bytes: number) => void;    
}


/**
 * NetConn is a wrapper around a socket that provides a promise-based interface
 * for reading and writing data.
 * The class intended to be extended by other classes that provide higher-level
 * functionality.
 */
export class NetConn extends EventEmitter {

    TAG: string;
    socket: net.Socket;   
    writeQ: SequentialTaskQueue;
    _err: Error | any;
    email?: string;
    static DEBUG = false;
    bwStats?: BWStats;
    countBWStats = false;
    inBytes: number = 0;
    outBytes: number = 0;
    logger?: Logger;
    options?: any;

    /**
     * Create a new NetConn based on a socket
     * @param {net.Socket} socket
     */
    constructor(socket: net.Socket, server?: any, options?: any, logger?: Logger) {
        super();
        this.socket = socket;
        this.TAG = `${Object.getPrototypeOf(this).constructor.name}_${socket.remoteAddress}:${socket.remotePort}`;        
        this.options = options;
        this.logger = logger;
        socket.setNoDelay(true);
        this.writeQ = new SequentialTaskQueue();

        const writeQErrorHandler = (err: Error | any) => {
            if (NetConn.DEBUG) this.log(`writeQ error: ${err}`);
        };
        this.writeQ.on("error", writeQErrorHandler);
        const nc = this;

        const errorHandler = (err: Error | any) => {
            if (NetConn.DEBUG) nc.log(`Error on socket`, err);
            nc._err = err;           
        };

        const closeHandler = () => {
            if (NetConn.DEBUG) nc.log(`Socket closed`);

            nc.socket.removeListener("error", errorHandler);
            nc.socket.removeListener("close", closeHandler)
            nc.emit('close');            
        }
        const timeoutHandler = () => {
            if (NetConn.DEBUG) nc.log(`Socket timeout`);
            try {
                nc.socket.destroy(new Error("Socket timeout"));
            } catch (err) {
                // ignore
            }
        }

        this.socket.on("error", errorHandler);
        this.socket.on("close", closeHandler)
        this.socket.on('timeout',timeoutHandler);
    }

    /**
     * Log message with this connection's tag
     * @param msg 
     */
    log(msg: string,err?: Error | any) {
        if(this.logger) {
            this.logger.info(`${this.TAG}: ${msg}`,err);
        } else {
            if (err)
                console.log(`${this.TAG}: ${msg}`,err);
            else
                console.log(`${this.TAG}: ${msg}`);
        }
    }

    /**
     * Connect to a host and return a NetConn after the connection is established
     * @param options 
     * @param isTLS 
     * @returns A NetConn object that wraps the socket
     */
    static async connectToHost(options: net.NetConnectOpts | tls.ConnectionOptions, isTLS: boolean = false): Promise<NetConn> {        
        const socket = await NetConn.promiseConnect(options,isTLS);
        return new NetConn(socket);
    }

    /**
     * Connect to a host and return a net.Socket or tls.Socket after the connection is established
     * @param options connect options including host, port, etc.
     * @param isTLS 
     * @returns A net.Socket or tls.Socket object
     */
    static promiseConnect(options: net.NetConnectOpts | tls.ConnectionOptions, isTLS: boolean = false): Promise<net.Socket | tls.TLSSocket> {
        return new Promise((resolve, reject) => {     
            let socket: net.Socket | tls.TLSSocket;   
            const connectHandler = () => {
                if (NetConn.DEBUG) console.log(`connected`);              
                socket.removeListener("error", errorHandler);
                resolve(socket);
            };
            const errorHandler = (err: any) => {
                if (NetConn.DEBUG) console.log(`connect error`, err);
                socket.removeListener("connect", connectHandler);
                reject(err)
            };
            if (isTLS) {                
                socket = tls.connect(options, connectHandler).once("error", errorHandler);
            } else {
                socket = net.connect(options as net.NetConnectOpts, connectHandler).once("error", errorHandler);
            }                        
        });
    }


    /**
     * Read a Buffer from the socket
     * @param {*} size The number of bytes to read. If not specified, read all available data
     * @returns {Buffer} The data read from the socket
     */
    readBuffer(size?: number | undefined): Promise<Buffer> {
        const nc = this;
        const debug = NetConn.DEBUG;
        
        if (debug) this.log(`readBuffer. size: ${size}`);
        
        const stream = this.socket;
        return new Promise((resolve, reject) => {
            if (nc._err) {
                reject(nc._err);
                return;
            }
            let isResolved = false;
            const readableHandler = () => {
                if (debug) this.log(`readBuffer. readableHandler`);                
                try {
                    const chunk = stream.read(size);                    
                    if (chunk) {
                        const chunkSize = chunk.length;
                        if (debug) this.log(`readBuffer. resolve: ${chunkSize}`);
                        removeListeners();
                        if (!isResolved) {
                            isResolved = true;
                            if (this.bwStats || this.countBWStats) {
                                this.addInBytes(chunkSize);
                            }
                            resolve(chunk);
                        }
                        return;
                    } else {
                        if (debug) this.log(`readBuffer. read returned null`);
                    }
                } catch (err) {
                    this.log(`readBuffer error: ${err}`);
                    removeListeners();
                    if (!isResolved) {
                        isResolved = true;
                        reject(err);
                    }
                }
            };
            const closeHandler = () => {
                if (debug) this.log("readBuffer closeHandler");
                removeListeners();
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error("Connection closed"));
                }
            };

            const endHandler = () => {
                if (debug) this.log("readBuffer endHandler");
                removeListeners();
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error("Connection ended"));
                }
            };

            const errorHandler = (err: any) => {
                if (debug) this.log("readBuffer errorHandler: " + err);
                removeListeners()
                if (!isResolved) {
                    isResolved = true;
                    reject(err)
                }
            };
            const removeListeners = () => {
                stream.removeListener("close", closeHandler);
                stream.removeListener("error", errorHandler);
                stream.removeListener("end", endHandler);
                stream.removeListener("readable", readableHandler);
            }
            
            if (debug) this.log(`readBuffer. wait to readable`);
            stream.on('readable', readableHandler);
            stream.on("close", closeHandler)
            stream.on("end", endHandler)
            stream.on("error", errorHandler)
            
        });
    }    
    

    /**
     * Write buffer to socket
     * @param chunk 
     * @param doNotCompressChunk 
     * @returns Promise that will be resolved when buffer is written
     */
    writeBuffer(chunk :Buffer): Promise<void> {
        const nc = this;
        return new Promise<void>((resolve, reject) => {
            if (nc._err) {
                reject(nc._err);
                return;
            }

            let haveListeners = true;

            const writeHandler = () => {                
                if (haveListeners) {
                    removeListeners();
                    resolve();
                }
            };

            const closeHandler = () => {
                if (haveListeners) {
                    removeListeners()
                    reject(new Error("writeBuffer: Connection closed"))
                }
            };

            const endHandler = () => {
                if (haveListeners) {
                    removeListeners()
                    reject(new Error("writeBuffer: Connection ended"))
                }
            };

            const errorHandler = (err: any) => {
                if (haveListeners) {
                    removeListeners()
                    reject(err)
                }
            };

            const removeListeners = () => {
                haveListeners = false;
                nc.socket.removeListener("close", closeHandler);
                nc.socket.removeListener("error", errorHandler);
                nc.socket.removeListener("end", endHandler);
            }
            nc.socket.on("close", closeHandler);
            nc.socket.on("end", endHandler);
            nc.socket.on("error", errorHandler);
            
            try {
                nc.socket.write(chunk, writeHandler);
                if (this.bwStats || this.countBWStats) {
                    this.addOutBytes(chunk.length);
                }
            } catch (err) {
                nc.log(`write error: ${err}`);
                errorHandler(err);
            }
            

        });
    }

    /**
     * Count output bytes for bandwidth stats
     * @param bytes 
     */
    addOutBytes(bytes: number) {
        if (this.bwStats) {
            this.bwStats.addOutBytes(bytes);
        } else {
            if (!this.outBytes) {
                this.outBytes = 0;
            }
            this.outBytes += bytes;
        }
    }

    /**
     * Count input bytes for bandwidth stats
     * @param bytes 
     */
    addInBytes(bytes: number) {
        if (this.bwStats) {
            this.bwStats.addInBytes(bytes);
        } else {            
            this.inBytes += bytes;
        }
    }


    /**
     * Close the socket
     * @returns Promise that will be resolved when socket is closed
     */
    end() {
        const nc = this;
        return new Promise<void>((resolve, reject) => {
            nc.socket.end(() => {
                resolve();
            });
        });
    }

    /**
     * Read 32 bit integer
     * @returns Promise that will be resolved with the integer
     */
    async readInt(): Promise<number> {
        const chunk = await this.readBuffer(4);
        return chunk.readInt32BE();
    }


    /**
     * Read 8 bit integer (byte)
     * @returns 
     */
    async readByte(): Promise<number> {
        const chunk = await this.readBuffer(1);
        return chunk.readInt8();
    }

    /**
     * Read boolean
     * @returns {boolean}
     */
    async readBoolean(): Promise<boolean> {
        const b = await this.readByte();
        if (b !== 0) {
            return true;
        } else {
            return false
        }
    }

    /**
     * Read float (32 bit) value
     * @returns {number}
     */
    async readFloat(): Promise<number> {
        const chunk = await this.readBuffer(4);
        return chunk.readFloatBE();
    }

    /**
     * Read big integer (64 bit) value
     * @returns {bigint}
     */
    async readLong(): Promise<bigint> {
        const chunk = await this.readBuffer(8);
        return chunk.readBigInt64BE();
    }

    /**
     * Read UTF string
     * @returns {string}
     */
    async readUTF(): Promise<string> {        
        const chunk = await this.readBuffer(2);
        const strlen = chunk.readInt16BE();        
        if (strlen > 0) {
            const chunk2 = await this.readBuffer(strlen);
            const text = chunk2.toString('utf8');
            return text;
        } else {
            return "";
        }
    }

    /**
     * Read UTF string or null
     * @returns {string | null}
     */
    async readString(): Promise<string | null> {        
        const isNull = await this.readBoolean();       
        let text = null;
        if (!isNull) {
            text = await this.readUTF();
        }
        return text;
    }

    /**
     * Read byte array
     * @returns {Buffer} data
     */
    async readByteArr(): Promise<Buffer> {
        const len = await this.readInt();
        const data = await this.readBuffer(len);
        return data;

    }

    /**
     * Read a JSON string and parse it
     * @returns The object or javascript value after parsing the JSON string
     */
    async readJSON(): Promise<any> {
        const str = await this.readString();
        if (str) {
            return JSON.parse(str);
        } else {
            return null;
        }
    }

    /**
     * Write any object or javascript value as JSON string
     * @param obj 
     */
    async writeJSON(obj: any): Promise<void> {
        const str = JSON.stringify(obj);
        await this.writeString(str);
    }

    /**
     * Write 32 bit integer
     * @param num 
     */
    async writeInt(num: number): Promise<void> {
        const b = Buffer.alloc(4);
        b.writeInt32BE(num);        
        await this.writeBuffer(b);
    }


    /**
     * Write boolean
     * @param bool 
     */
    async writeBoolean(bool: boolean): Promise<void> {
        const b = Buffer.alloc(1);
        b.writeInt8(bool ? 1 : 0);
        await this.writeBuffer(b);
    }

    /**
     * Write string
     * @param {string} str
     */
    async writeString(str: string | null): Promise<void> {
            if (!str) {                
                await this.writeBoolean(true);
                return;
            }
            const strbuf = Buffer.from(str, 'utf8');
            const b = Buffer.alloc(3);            
            b.writeInt8(0)
            b.writeInt16BE(strbuf.length, 1);
            await this.writeBuffer(b);
            await this.writeBuffer(strbuf);
        }


    /**
     * Write float (32 bit) value
     * @param {number} f
     */
    async writeFloat(f: number): Promise<void> {
        const b = Buffer.alloc(4);
        b.writeFloatBE(f);
        await this.writeBuffer(b);
    }

    /**
     * Write big integer (64 bit) value
     * @param {bigint} num
     */
    async writeLong(num: bigint): Promise<void> {
        const b = Buffer.alloc(8);
        b.writeBigInt64BE(num);        
        await this.writeBuffer(b);
    }
}

