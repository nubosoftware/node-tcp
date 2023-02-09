import { Duplex, Readable, ReadableOptions } from "stream";
import zlib from "zlib";
import debug from "debug";



const log = debug("node-tcp:CompressedSocket");
const errorlog = debug("node-tcp:error:CompressedSocket");


/**
 * Size of the compression buffer. This is the size of the buffer that is used to compress data before sending it.
 */
const COMPRESSION_BUFFER_SIZE = 64000;


/**
 * A duplex stream that compresses data before sending it and decompresses data before it is read.
 * This is used to compress data before sending it over the network.
 */
export class CompressedSocket extends Duplex {

    private stream: Duplex;
    private _closed: boolean = false;
    private _err?: Error;
    private waitReadBlock?: Buffer;

    private compressBuff?: Buffer;
    private compressBuffPos: number = 0;
    private compressArr?: Int8Array;


    /**
     * Create a new CompressedSocket
     * @param stream The stream to wrap
     * @param errorLogger set this to a function to log errors. If not set, errors will be logged to console.error
     */
    constructor(stream: Duplex, errorLogger?: (...args: any[]) => any) {
        super();
        if (errorLogger) {
            errorlog.log = errorLogger;
        }     

        log(`constructor`);        
        this.stream = stream;

        const cs = this;

        const finishHandler = () => {
            log(`finishHandler()`);
            removeListeners();
            cs._closed = true;
            cs.emit('close');
        };

        const closeHandler = () => {
            log(`closeHandler()`);
            removeListeners();
            cs._closed = true;
            cs.emit('close');
        };

        const errorHandler = (err: any) => {
            errorlog(`errorHandler(): ${err}`, err);         
            cs._err = err;           
        };

        const removeListeners = () => {
            cs.stream.removeListener("close", closeHandler);
            cs.stream.removeListener("error", errorHandler);
            cs.stream.removeListener("finish", finishHandler);
        }

        this.stream.on("close", closeHandler);
        this.stream.on("error", errorHandler);
        this.stream.on("finish", finishHandler);
    }

    /**
     * Write data to the stream. This will compress the data before sending it.
     * @param chunk 
     * @param writeUnCompressed 
     * @returns Promise that resolves when the data has been written.
     */
    async writeBuffer(chunk: Buffer, writeUnCompressed: boolean = false): Promise<void> {
        if (!this.compressBuff) {
            this.compressArr = new Int8Array(COMPRESSION_BUFFER_SIZE);
            this.compressBuff = Buffer.from(this.compressArr.buffer);
            this.compressBuffPos = 0;
        }
        if (writeUnCompressed) {
            if (this.compressBuffPos > 0) {
                // send preious compressed buffer
                await this.compressAndSend();
            }
            return await this.writeBufferImp(chunk, writeUnCompressed);
        } else {
            // write compress data
            if (this.compressBuffPos + chunk.length > COMPRESSION_BUFFER_SIZE) {
                await this.compressAndSend();
            }
            if (chunk.length <= COMPRESSION_BUFFER_SIZE) {
                chunk.copy(this.compressBuff, this.compressBuffPos);
                this.compressBuffPos += chunk.length;
                log(`Add write data of size: ${chunk.length}. total buffer: ${this.compressBuffPos}`);
            } else {
                log(`large buffer for compression. divide it`);
                let cnt = 0;

                while (cnt < chunk.length) {
                    const remains = (chunk.length - cnt);
                    const len = (remains > COMPRESSION_BUFFER_SIZE ? COMPRESSION_BUFFER_SIZE : remains);                    
                    this.copyBuff(chunk, this.compressBuff, cnt, 0, len);
                    this.compressBuffPos = len;
                    log(`Sending ${len} bytes from offset ${cnt}`);
                    await this.compressAndSend();
                    cnt += len;
                }
            }
        }
    }

    /**
     * Compress the data in the compression buffer and send it.
     * @returns a promise that resolves when the data has been sent.
     */
    async compressAndSend() {
        if (!this.compressArr || this.compressBuffPos === 0) {
            return;
        }
        const sendBuff = Buffer.from(this.compressArr.buffer, 0, this.compressBuffPos);       
        log(`compressAndSend: this.compressBuffPos: ${this.compressBuffPos}, sendBuff : ${sendBuff.length}`);        
        await this.writeBufferImp(sendBuff, false);
        this.compressBuffPos = 0;
    }

    /**
     * Utility function to copy data from one buffer to another.
     * @param srcBuff 
     * @param targetBuff 
     * @param offsetSrc 
     * @param offsetTarget 
     * @param length 
     */
    copyBuff(srcBuff: Buffer, targetBuff: Buffer, offsetSrc: number, offsetTarget: number, length?: number) {
        if (!length) {
            length = srcBuff.length - offsetSrc;
        }
        for (let i = 0; i < length; i++) {
            const b = srcBuff.readUInt8(i + offsetSrc);
            targetBuff.writeUInt8(b, i + offsetTarget);
        }
    }

    /**
     * Compress a buffer and send it.
     * @param chunk 
     * @param doNotCompressChunk 
     * @returns a promise that resolves when the data has been sent.
     */
    private writeBufferImp(chunk: Buffer, doNotCompressChunk: boolean = false): Promise<void> {
        const nc = this;
        return new Promise((resolve, reject) => {
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
                    reject(new Error("writeChunkImp: Connection closed"))
                }
            };

            const endHandler = () => {
                if (haveListeners) {
                    removeListeners()
                    reject(new Error("writeChunkImp: Connection ended"))
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
                nc.stream.removeListener("close", closeHandler);
                nc.stream.removeListener("error", errorHandler);
                nc.stream.removeListener("end", endHandler);
            }
            nc.stream.on("close", closeHandler);
            nc.stream.on("end", endHandler);
            nc.stream.on("error", errorHandler);

            if (doNotCompressChunk) {
                const buf = Buffer.alloc(5);
                buf.writeUInt8(0);
                buf.writeUInt32BE(chunk.length, 1);
                try {
                    nc.stream.write(buf);
                    nc.stream.write(chunk, writeHandler);
                    // if (this.bwStats || this.countBWStats) {
                    //     this.addOutBytes(chunk.length + 5);
                    // }
                } catch (err) {
                    errorlog(`write error: ${err}`);
                    errorHandler(err);
                }
            } else {
                zlib.deflate(chunk, (err, deflatted) => {
                    if (err) {
                        errorlog(`deflate error: ${err}`);
                        errorHandler(err);
                    } else {
                        const buf = Buffer.alloc(5);
                        buf.writeUInt8(1);
                        buf.writeUInt32BE(deflatted.length, 1);
                        try {
                            nc.stream.write(buf);
                            nc.stream.write(deflatted, writeHandler);
                            // if (this.bwStats || this.countBWStats) {
                            //     this.addOutBytes(deflatted.length + 5);
                            // }
                        } catch (err) {
                            errorlog(`write error: ${err}`);
                            errorHandler(err);
                        }
                        log(`write compress stream di: 1, len: ${deflatted.length}, source len: ${chunk.length}`);
                    }
                });
            }
        });
    }

    /**
     * Read data from the stream.
     * @param size 
     */
    _read(size: number) {
        log(`_read start. stream: ${this.stream}`);
        const cr = this;
        const readableHandler = () => {
            log(`readableHandler`);
            let canPush = true;
            let needMoreData = false;
            while (canPush && !cr._err && !cr.closed) {
                let b;
                if (cr.waitReadBlock) {
                    b = cr.waitReadBlock;
                    delete cr.waitReadBlock;
                } else {
                    b = cr.stream.read(5);
                }
                if (b) {
                    const di = b.readUInt8();
                    const len = b.readUInt32BE(1);
                    const content = cr.stream.read(len);
                    if (content) {
                        if (di === 1) { // defalted stream
                            zlib.inflate(content, (err, inflated) => {
                                if (err) {
                                    errorlog(`Error inflate: ${err} `, err);
                                    cr.destroy(err);
                                    return;
                                }
                                log(`Inflate ${content.length} bytes to ${inflated.length} bytes and push to stream`);
                                cr.push(inflated);
                            });
                        } else {
                            // not defalted stream - return chunk
                            log(`Push ${content.length} bytes to stream`);
                            canPush = cr.push(content);
                        }
                    } else {
                        log(`Buffer not read with ${len} bytes. Return header (5 bytes) to stream`);                        
                        cr.waitReadBlock = b;
                        needMoreData = true;
                        break;
                    }
                } else {
                    break;
                }
            }
            log(`Loop finished.  canPush: ${canPush}, cr._err: ${cr._err}, cr.closed: ${cr.closed}, needMoreData: ${needMoreData}`);
            if (!needMoreData) {
                removeListeners();
            }

        };


        const closeHandler = () => {
            removeListeners();
            log(`_read closeHandler`);
        };

        const endHandler = () => {
            removeListeners();
            log(`endHandler`);
        };

        const errorHandler = (err: any) => {
            removeListeners()
            errorlog(`_read errorHandler`, err);
        };
        const removeListeners = () => {
            cr.stream.removeListener("close", closeHandler);
            cr.stream.removeListener("error", errorHandler);
            cr.stream.removeListener("end", endHandler);
            cr.stream.removeListener("readable", readableHandler);
        }
        cr.stream.on("close", closeHandler)
        cr.stream.on("end", endHandler)
        cr.stream.on("error", errorHandler)
        cr.stream.on('readable', readableHandler);

    }
}
