const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

class RouterSocketV3 {
    static MESSAGE_TYPE_DATA = 0;
    static MESSAGE_TYPE_HEADER = 1;
    static MESSAGE_TYPE_RST_STREAM = 3;
    static MESSAGE_TYPE_WINDOW_UPDATE = 8;

    static ERROR_INTERNAL = 1;

    constructor(route, componentName, webSocketFarmV3, remotePort, proxyListeners, discardClientForwardedHeaders, sendLegacyForwardedHeaders, viaValue, doNotProxy) {
        this.route = route;
        this.componentName = componentName;
        this.routerSocketID = uuidv4();
        this.webSocketFarmV3 = webSocketFarmV3;
        this.connectorInstanceID = remotePort;
        this.proxyListeners = proxyListeners;
        this.discardClientForwardedHeaders = discardClientForwardedHeaders;
        this.sendLegacyForwardedHeaders = sendLegacyForwardedHeaders;
        this.viaValue = viaValue;
        this.doNotProxy = doNotProxy;
        this.isRemoved = false;
        this.contextMap = new Map();
        this.idMaker = 0;
        this.onReadyForAction = null;
        this.remoteAddress = null;
        this.webSocket = null;
    }

    onConnect(session) {
        this.remoteAddress = session.remoteAddress;
        this.webSocket = session;
        if (this.onReadyForAction) {
            this.onReadyForAction();
        }
    }

    async sendRequestOverWebSocketV3(clientRequest, clientResponse) {
        const requestId = ++this.idMaker;
        const asyncHandle = this.createAsyncHandle(clientRequest);

        const context = this.createRequestContext(requestId, clientRequest, clientResponse, asyncHandle);
        this.contextMap.set(requestId, context);

        this.setupAsyncHandleListeners(context);

        try {
            const headers = this.processRequestHeaders(clientRequest);
            await this.notifyProxyListeners('onBeforeProxyToTarget', context, headers);

            const headerText = this.createHeaderText(clientRequest, headers);

            if (clientRequest.headers['content-length'] || clientRequest.headers['transfer-encoding']) {
                await this.sendHeadersWithBody(context, headerText);
            } else {
                await this.sendHeadersWithoutBody(context, headerText);
            }
        } catch (error) {
            this.handleRequestError(context, error);
        }
    }

    onClientClosed(statusCode, reason) {
        console.log(`WebSocket closed by client: ${statusCode} ${reason}`);
        if (!this.isRemoved) {
            this.webSocketFarmV3.removeWebSocket(this);
            this.isRemoved = true;
        }
        if (statusCode !== 1000) {
            console.warn(`WebSocket exceptionally closed: statusCode=${statusCode}, reason=${reason}`);
        }
        for (const context of this.contextMap.values()) {
            this.notifyClientRequestClose(context, statusCode);
        }
    }

    onError(cause) {
        console.error("RouterSocketV3 error:", cause);
        if (!this.isRemoved) {
            this.webSocketFarmV3.removeWebSocket(this);
            this.isRemoved = true;
        }
        for (const context of this.contextMap.values()) {
            this.notifyClientRequestError(context, cause);
        }
    }

    async onBinary(byteBuffer, isLast, doneAndPullData, releaseBuffer) {
        const messageType = byteBuffer[0];
        const flags = byteBuffer[1];
        const requestId = byteBuffer.readUInt32BE(2);

        const context = this.contextMap.get(requestId);
        if (!context) {
            releaseBuffer();
            doneAndPullData(null);
            return;
        }

        try {
            switch (messageType) {
                case RouterSocketV3.MESSAGE_TYPE_DATA:
                    await this.handleData(context, isLast, (flags & 1) > 0, byteBuffer.slice(6), doneAndPullData, releaseBuffer);
                    break;
                case RouterSocketV3.MESSAGE_TYPE_HEADER:
                    await this.handleHeader(context, flags, byteBuffer.slice(6), doneAndPullData, releaseBuffer);
                    break;
                case RouterSocketV3.MESSAGE_TYPE_RST_STREAM:
                    await this.handleRstStream(context, byteBuffer.slice(6), doneAndPullData, releaseBuffer);
                    break;
                case RouterSocketV3.MESSAGE_TYPE_WINDOW_UPDATE:
                    await this.handleWindowUpdate(context, byteBuffer.slice(6), doneAndPullData, releaseBuffer);
                    break;
                default:
                    console.info("Unsupported binary message type", messageType);
                    releaseBuffer();
                    doneAndPullData(null);
            }
        } catch (error) {
            console.error("Error handling binary message:", error);
            this.notifyClientRequestError(context, error);
            releaseBuffer();
            doneAndPullData(error);
        }
    }

    async handleData(context, isLast, isEnd, data, doneAndPullData, releaseBuffer) {
        if (data.length === 0) {
            if (isEnd) await this.notifyClientRequestClose(context, 1000);
            releaseBuffer();
            doneAndPullData(null);
            return;
        }

        context.wssOnBinaryCallCount++;

        if (this.state().endState) {
            if (isEnd) await this.notifyClientRequestClose(context, 1000);
            releaseBuffer();
            doneAndPullData(new Error("Received binary message from connector but socket is in end state"));
            return;
        }

        console.debug(`routerName=${this.route}, routerSocketID=${this.routerSocketID}, sending ${data.length} bytes to client`);

        doneAndPullData(null);

        try {
            await this.writeToClient(context, data);
            if (isEnd) await this.notifyClientRequestClose(context, 1000);
            context.toClientBytes += data.length;
            await this.sendWindowUpdate(context.requestId, data.length);
            await this.notifyProxyListeners('onResponseBodyChunkReceivedFromTarget', context, data);
        } catch (error) {
            console.error("Error writing to client:", error);
            context.error = error;
            await context.asyncHandle.complete(error);
        } finally {
            releaseBuffer();
        }
    }

    async handleHeader(context, flags, data, doneAndPullData, releaseBuffer) {
        const isStreamEnd = (flags & 1) > 0;
        const isHeaderEnd = (flags & 4) > 0;
        const content = data.toString('utf8');

        if (!isHeaderEnd) {
            if (!context.headerLineBuilder) context.headerLineBuilder = '';
            context.headerLineBuilder += content;
        } else {
            const fullContent = context.headerLineBuilder ? context.headerLineBuilder + content : content;
            await this.handleHeaderMessage(context, fullContent);
        }

        if (isStreamEnd) {
            await this.notifyClientRequestClose(context, 1000);
        }

        await this.sendWindowUpdate(context.requestId, data.length);
        releaseBuffer();
        doneAndPullData(null);
    }

    async handleRstStream(context, data, doneAndPullData, releaseBuffer) {
        try {
            const errorCode = data.readInt32BE(0);
            const message = data.slice(4).toString('utf8');
            await this.notifyClientRequestError(context, new Error(`Stream closed by connector, errorCode=${errorCode}, message=${message}`));
        } catch (error) {
            console.warn("Exception on handling rst_stream", error);
        } finally {
            releaseBuffer();
            doneAndPullData(null);
        }
    }

    async handleWindowUpdate(context, data, doneAndPullData, releaseBuffer) {
        const windowUpdate = data.readInt32BE(0);
        context.ackedBytes(windowUpdate);
        releaseBuffer();
        doneAndPullData(null);
    }

    async resetStream(context, errorCode, message) {
        if (context && !context.state.isCompleted && !context.isRstStreamSent) {
            const buffer = this.createRstMessage(context.requestId, errorCode, message);
            await this.sendData(buffer);
            context.isRstStreamSent = true;
        }

        if (context) {
            this.contextMap.delete(context.requestId);
        }
    }

    state() {
        return {
            endState: this.webSocket ? this.webSocket.readyState === WebSocket.CLOSING || this.webSocket.readyState === WebSocket.CLOSED : true
        };
    }

    async notifyClientRequestClose(context, statusCode) {
        try {
            await this.notifyProxyListeners('onResponseBodyChunkReceived', context);

            if (context.response && !context.response.headersSent) {
                if (statusCode === 1011) {
                    context.response.status(502);
                } else if (statusCode === 1008) {
                    context.response.status(400);
                }
            }

            if (context.asyncHandle) {
                if (statusCode === 1000) {
                    await context.asyncHandle.complete();
                } else {
                    console.info(`Closing client request early due to cranker wss connection close with status code ${statusCode}`);
                    await context.asyncHandle.complete(new Error("Upstream Server Error"));
                }
            }
        } finally {
            if (statusCode !== 1000 && !context.error) {
                context.error = new Error(`Upstream server close with code ${statusCode}`);
            }
            await this.raiseCompletionEvent(context);
            this.contextMap.delete(context.requestId);
        }
    }

    async notifyClientRequestError(context, cause) {
        try {
            context.error = cause;
            if (cause instanceof Error && cause.message.includes("timeout")) {
                if (context.response && !context.response.headersSent) {
                    this.sendSimpleResponse(context.response, 504, "504 Gateway Timeout", `The <code>${this.route}</code> service did not respond in time.`);
                } else if (context.asyncHandle) {
                    console.info("Closing client request early due to timeout");
                    await context.asyncHandle.complete(cause);
                }
            } else {
                if (context.response && !context.response.headersSent) {
                    this.sendSimpleResponse(context.response, 502, "502 Bad Gateway", `The <code>${this.route}</code> service error.`);
                } else if (context.asyncHandle) {
                    console.info("Closing client request early due to cranker wss connection error", cause);
                    await context.asyncHandle.complete(cause);
                }
            }
        } finally {
            await this.raiseCompletionEvent(context);
            console.warn(`Stream error: requestId=${context.requestId}, target=${context.request.url}, error=${cause.message}`);
            this.contextMap.delete(context.requestId);
        }
    }

    // Helper methods

    createRequestContext(requestId, clientRequest, clientResponse, asyncHandle) {
        return {
            requestId,
            request: clientRequest,
            response: clientResponse,
            asyncHandle,
            error: null,
            isRstStreamSent: false,
            fromClientBytes: 0,
            toClientBytes: 0,
            durationMillis: 0,
            wssReceivedAckBytes: 0,
            isWssSending: 0,
            isWssWritable: true,
            isWssWriting: false,
            wssWriteCallbacks: [],
            wssOnBinaryCallCount: 0,
            headerLineBuilder: null,
            state: { isCompleted: false }
        };
    }

    setupAsyncHandleListeners(context) {
        context.asyncHandle.on('finish', (info) => {
            if (!info.completedSuccessfully) {
                console.info("Client request did not complete successfully", context.request);
                if (!context.error) {
                    context.error = new Error("Client request did not complete successfully.");
                }
                this.raiseCompletionEvent(context);
                if (!this.state().endState) {
                    this.resetStream(context, RouterSocketV3.ERROR_INTERNAL, "Client early closed");
                }
            }
        });
    }

    async raiseCompletionEvent(context) {
        if (context && context.request && this.proxyListeners.length > 0) {
            context.durationMillis = Date.now() - context.request.startTime;
            for (const listener of this.proxyListeners) {
                try {
                    await listener.onComplete(context);
                } catch (error) {
                    console.warn("Error thrown by completion listener", error);
                }
            }
        }
    }

    async notifyProxyListeners(event, ...args) {
        for (const listener of this.proxyListeners) {
            if (typeof listener[event] === 'function') {
                await listener[event](...args);
            }
        }
    }

    createAsyncHandle(clientRequest) {
        // Implement based on your async handling mechanism
    }

    processRequestHeaders(clientRequest) {
        // Implement header processing logic
    }

    createHeaderText(clientRequest, headers) {
        // Implement header text creation
    }

    async sendHeadersWithBody(context, headerText) {
        // Implement logic for sending headers when there's a body
    }

    async sendHeadersWithoutBody(context, headerText) {
        // Implement logic for sending headers when there's no body
    }

    handleRequestError(context, error) {
        // Implement error handling for request setup
    }

    async handleHeaderMessage(context, content) {
        // Implement header message handling
    }

    async writeToClient(context, data) {
        // Implement writing data to the client
    }

    async sendWindowUpdate(requestId, length) {
        // Implement sending window update message
    }

    sendSimpleResponse(response, status, header, htmlBody) {
        response.writeHead(status, { 'Content-Type': 'text/html' });
        response.end(`
            <html>
                <head><title>${header}</title></head>
                <body>
                    <h1>${header}</h1>
                    <p>${htmlBody}</p>
                </body>
            </html>
        `);
    }

    createRstMessage(requestId, errorCode, message) {
        // Implement creation of RST_STREAM message
    }

    async sendData(buffer) {
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            return new Promise((resolve, reject) => {
                this.webSocket.send(buffer, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }
    }
}

module.exports = RouterSocketV3;