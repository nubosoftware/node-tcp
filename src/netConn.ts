"use strict";

import net from "net";
import tls from "tls";
import { EventEmitter } from "events";
import { SequentialTaskQueue } from "sequential-task-queue";
import { CompressedSocket } from "./compressedSocket";
import debug from "debug";
import { Readable } from "stream";


// enable erorr logging
if (process.env.DEBUG) {
    debug.enable(`${process.env.DEBUG},node-tcp:error:*`);
} else {
    debug.enable("node-tcp:error:*");
}


const log = debug("node-tcp:NetConn");
const errorlog = debug("node-tcp:error:NetConn");


const unsignedIntMax = 4294967295;
const signedShortMax = 32767;


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
    bwStats?: BWStats;
    countBWStats = false;
    inBytes: number = 0;
    outBytes: number = 0;
    options?: any;
    log: debug.Debugger;
    compressIn: boolean = false;
    compressOut: boolean = false;
    compressedSocket?: CompressedSocket;
    readTimeout: number = 0;

    /**
     * Create a new NetConn based on a socket
     * @param {net.Socket} socket
     */
    constructor(socket: net.Socket, server?: any, options?: any, errorLogger?: (...args: any[]) => any) {
        super();
        if (errorLogger) {
            errorlog.log = errorLogger;
        }
        this.socket = socket;
        this.TAG = `${Object.getPrototypeOf(this).constructor.name}_${socket.remoteAddress}:${socket.remotePort}`;
        this.log = debug(`node-tcp:NetConn:${this.TAG}`);        
        this.log(`constructor`);
        this.options = options;
        socket.setNoDelay(true);
        this.writeQ = new SequentialTaskQueue();

        const writeQErrorHandler = (err: Error | any) => {
            this.log(`writeQ error: ${err}`);
        };
        this.writeQ.on("error", writeQErrorHandler);
        const nc = this;

        const errorHandler = (err: Error | any) => {
            nc.log(`Error on socket`, err);
            nc._err = err;
        };

        const closeHandler = () => {
            nc.log(`Socket closed`);

            nc.socket.removeListener("error", errorHandler);
            nc.socket.removeListener("close", closeHandler)
            nc.emit('close');
        }
        const timeoutHandler = () => {
            nc.log(`Socket timeout`);
            try {
                nc.socket.destroy(new Error("Socket timeout"));
            } catch (err) {
                // ignore
            }
        }

        this.socket.on("error", errorHandler);
        this.socket.on("close", closeHandler)
        this.socket.on('timeout', timeoutHandler);
    }

    /**
     * Connect to a host and return a NetConn after the connection is established
     * @param options 
     * @param isTLS 
     * @returns A NetConn object that wraps the socket
     */
    static async connectToHost(options: net.TcpNetConnectOpts | tls.ConnectionOptions, isTLS: boolean = false): Promise<NetConn> {
        log(`connectToHost. host: ${options.host}, port: ${options.port}, isTLS: ${isTLS}`);
        const socket = await NetConn.promiseConnect(options, isTLS);
        return new NetConn(socket);
    }

    /**
     * Connect to a host and return a net.Socket or tls.Socket after the connection is established
     * @param options connect options including host, port, etc.
     * @param isTLS 
     * @returns A net.Socket or tls.Socket object
     */
    static promiseConnect(options: net.TcpNetConnectOpts | tls.ConnectionOptions, isTLS: boolean = false): Promise<net.Socket | tls.TLSSocket> {
        return new Promise((resolve, reject) => {
            let socket: net.Socket | tls.TLSSocket;
            const connectHandler = () => {
                log(`connected`);
                socket.removeListener("error", errorHandler);
                resolve(socket);
            };
            const errorHandler = (err: any) => {
                log(`connect error`, err);
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
     * Start to compress data on the socket in one or both directions.
     * If the socket is already compressed, this method does nothing.
     * Compression cannot be disabled once enabled.
     * @param compressIn 
     * @param compressOut 
     */
    setCompression(compressIn: boolean, compressOut: boolean) {        
        if (compressIn && this.compressIn === false) {
            if (!this.compressedSocket) {
                this.compressedSocket = new CompressedSocket(this.socket);
            }
            this.compressIn = true;
        } 
        if (compressOut) {
            if (!this.compressedSocket) {
                this.compressedSocket = new CompressedSocket(this.socket);                
            }
            this.compressOut = true;
        }
    }

    /**
     * Set the timeout on the socket
     * If an idle socket times out, it will be destroyed.
     * @param timeout The timeout in milliseconds, or 0 to disable
     */
    setTimeout(timeout: number) {
        this.socket.setTimeout(timeout);
    }

    /**
     * Set the timeout on the socket for read operations
     * If a read operation times out, the read will be aborted.
     * @param timeout The timeout in milliseconds, or 0 to disable
     */
    setReadTimeout(timeout: number) {
        this.readTimeout = timeout;
    }


    /**
     * Read a Buffer from the socket
     * @param {*} size The number of bytes to read. If not specified, read all available data
     * @returns {Buffer} The data read from the socket
     */
    readBuffer(size?: number | undefined): Promise<Buffer> {
        const nc = this;

        nc.log(`readBuffer. size: ${size}`);

        let stream: Readable;
        if (this.compressIn && this.compressedSocket) {
            stream = this.compressedSocket;
        } else {
            stream = this.socket;
        }
        return new Promise((resolve, reject) => {
            if (nc._err) {
                reject(nc._err);
                return;
            }
            if (!this.socket || this.socket.destroyed) {
                reject(new Error("Socket destroyed"));
                return;
            }
            let isResolved = false;
            const readableHandler = () => {
                nc.log(`readBuffer. readableHandler`);
                try {
                    const chunk = stream.read(size);
                    if (chunk) {
                        const chunkSize = chunk.length;
                        nc.log(`readBuffer. resolve: ${chunkSize}`);
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
                        nc.log(`readBuffer. read returned null`);
                    }
                } catch (err) {
                    nc.log(`readBuffer error: ${err}`);
                    removeListeners();
                    if (!isResolved) {
                        isResolved = true;
                        reject(err);
                    }
                }
            };
            const closeHandler = () => {
                nc.log("readBuffer closeHandler");
                removeListeners();
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error("Connection closed"));
                }
            };

            const endHandler = () => {
                nc.log("readBuffer endHandler");
                removeListeners();
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error("Connection ended"));
                }
            };

            const errorHandler = (err: any) => {
                nc.log("readBuffer errorHandler: " + err);
                removeListeners()
                if (!isResolved) {
                    isResolved = true;
                    reject(err)
                }
            };
            const readTimeoutHandler = () => {
                nc.log("readBuffer readTimeoutHandler");
                removeListeners();
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error("Read timeout"));
                }
            };
            let readTimeout: NodeJS.Timeout | undefined;

            const removeListeners = () => {
                stream.removeListener("close", closeHandler);
                stream.removeListener("error", errorHandler);
                stream.removeListener("end", endHandler);
                stream.removeListener("readable", readableHandler);
                if (readTimeout) {
                    clearTimeout(readTimeout);
                    readTimeout = undefined;
                }
            }

            nc.log(`readBuffer. wait to readable`);
            stream.on('readable', readableHandler);
            stream.on("close", closeHandler)
            stream.on("end", endHandler)
            stream.on("error", errorHandler)
            if (nc.readTimeout) {
                // nc.log(`readBuffer. set timeout: ${nc.readTimeout}`);
                readTimeout = setTimeout(readTimeoutHandler, nc.readTimeout);
            }

        });
    }


    /**
     * Flush the compression buffer. If it not compressed, this method does nothing.
     */
    async flush(): Promise<void> {
        if (this.compressedSocket && this.compressOut) {
            await this.compressedSocket.compressAndSend()
        }
    }


    /**
     * Write buffer to socket
     * @param chunk 
     * @param doNotCompressChunk 
     * @returns Promise that will be resolved when buffer is written
     */
    writeBuffer(chunk: Buffer, writeUnCompressed: boolean = false): Promise<void> {
        if (this.compressOut && this.compressedSocket) {
            if (this.bwStats || this.countBWStats) {
                this.addOutBytes(chunk.length);
            }
            return this.compressedSocket.writeBuffer(chunk);
        }
        const nc = this;
        return new Promise<void>((resolve, reject) => {
            if (nc._err) {
                reject(nc._err);
                return;
            }
            if (!this.socket || this.socket.destroyed) {
                reject(new Error("Socket destroyed"));
                return;
            }

            let haveListeners = true;

            const writeHandler = () => {
                if (haveListeners) {
                    nc.log(`writeBuffer. writeHandler`);
                    removeListeners();
                    resolve();
                }
            };

            const closeHandler = () => {
                if (haveListeners) {
                    nc.log(`writeBuffer. Connection closed`);
                    removeListeners()
                    reject(new Error("writeBuffer: Connection closed"))
                }
            };

            const endHandler = () => {
                if (haveListeners) {
                    nc.log(`writeBuffer. Connection ended`);
                    removeListeners()
                    reject(new Error("writeBuffer: Connection ended"))
                }
            };

            const errorHandler = (err: any) => {
                if (haveListeners) {
                    nc.log(`writeBuffer. Error: ${err}`);
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
                nc.log(`writeBuffer. write ${chunk.length} bytes`);
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
        nc.log("end");
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
        const chunk = await this.readBuffer(4);
        const strlen = chunk.readUint32BE();
        if (strlen > 0) {
            const chunk2 = await this.readBuffer(strlen);
            const text = chunk2.toString('utf8');
            return text;
        } else {
            return "";
        }
    }
    /**
     * Read UTF string (old format. length is 16 bit)
     * @returns {string}
     */
    async readUTFOld(): Promise<string> {
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
     * Read UTF string or null (old format. length is 16 bit)
     * @returns {string | null}
     */
    async readStringOld(): Promise<string | null> {
        const isNull = await this.readBoolean();
        let text = null;
        if (!isNull) {
            text = await this.readUTFOld();
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
        if (strbuf.length > unsignedIntMax) {
            throw new Error(`String too long: ${strbuf.length} bytes`);
        }
        const b = Buffer.alloc(5);
        b.writeInt8(0)
        b.writeUInt32BE(strbuf.length, 1);
        await this.writeBuffer(b);
        await this.writeBuffer(strbuf);
    }

    /**
     * Write string
     * @param {string} str
     */
    async writeStringOld(str: string | null): Promise<void> {
        if (!str) {
            await this.writeBoolean(true);
            return;
        }
        const strbuf = Buffer.from(str, 'utf8');
        if (strbuf.length > signedShortMax) {
            throw new Error(`String too long: ${strbuf.length} bytes`);
        }
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

