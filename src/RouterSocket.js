const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

class RouterSocket {
    constructor(route, componentName, webSocketFarm, remotePort, proxyListeners) {
        this.route = route;
        this.componentName = componentName;
        this.routerSocketID = uuidv4();
        this.webSocketFarm = webSocketFarm;
        this.connectorInstanceID = remotePort;
        this.proxyListeners = proxyListeners;
        this.isRemoved = false;
        this.hasResponse = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        this.binaryFramesReceived = 0;
        this.onReadyForAction = null;
        this.remoteAddress = null;
        this.asyncHandle = null;
        this.response = null;
        this.clientRequest = null;
        this.socketWaitInMillis = 0;
        this.error = null;
        this.durationMillis = 0;
        this.onTextBuffer = null;
        this.webSocket = null;
    }

    isCatchAll() {
        return this.route === '*';
    }

    socketSessionClose() {
        if (this.webSocket) {
            this.webSocket.close(1000, "Going away");
        }
    }

    onConnect(session) {
        this.remoteAddress = session.remoteAddress;
        this.webSocket = session;
        if (this.onReadyForAction) {
            this.onReadyForAction();
        }
    }

    onClientClosed(statusCode, reason) {
        console.log(`Client closed connection: ${statusCode} ${reason}`);
        this.notifyProxyListeners('onResponseBodyChunkReceived');

        if (this.hasResponse && !this.response.headersSent) {
            if (statusCode === 1011) {
                this.response.status(502);
            } else if (statusCode === 1008) {
                this.response.status(400);
            }
        }

        if (this.asyncHandle) {
            if (statusCode === 1000) {
                this.asyncHandle.complete();
            } else {
                console.log(`Closing client request early due to cranker wss connection close with status code ${statusCode}`);
                this.asyncHandle.complete(new Error("Upstream Server Error"));
            }
        }

        if (!this.isRemoved) {
            this.webSocketFarm.removeWebSocketAsync(this.route, this, () => {});
            this.isRemoved = true;
        }

        this.raiseCompletionEvent();
    }

    onError(cause) {
        this.error = cause;
        console.error("Router socket error:", cause);
        this.removeBadWebSocket();

        if (cause instanceof Error && cause.message.includes("timeout")) {
            if (this.response && !this.response.headersSent) {
                this.sendSimpleResponse(504, "504 Gateway Timeout", `The <code>${this.route}</code> service did not respond in time.`);
            } else if (this.asyncHandle) {
                console.log("Closing client request early due to timeout");
                this.asyncHandle.complete(cause);
            }
        } else {
            if (this.response && !this.response.headersSent) {
                this.sendSimpleResponse(502, "502 Bad Gateway", `The <code>${this.route}</code> service error.`);
            } else if (this.asyncHandle) {
                console.log("Closing client request early due to cranker wss connection error", cause);
                this.asyncHandle.complete(cause);
            }
        }

        this.raiseCompletionEvent();
    }

    onText(message, isLast) {
        if (!this.hasResponse || this.webSocket.readyState === WebSocket.CLOSING || this.webSocket.readyState === WebSocket.CLOSED) {
            console.error("Received text message from connector but hasResponse=false or socket is closing/closed");
            return;
        }

        if (!isLast && !this.onTextBuffer) {
            this.onTextBuffer = '';
        }

        if (this.onTextBuffer !== null) {
            this.onTextBuffer += message;
            if (this.onTextBuffer.length > 64 * 1024) {
                throw new Error("Response header too large");
            }
        }

        if (isLast) {
            const messageToApply = this.onTextBuffer !== null ? this.onTextBuffer : message;
            const protocolResponse = this.parseProtocolResponse(messageToApply);
            this.response.status(protocolResponse.status);
            this.putHeadersTo(protocolResponse);

            try {
                this.notifyProxyListeners('onBeforeRespondingToClient');
                this.notifyProxyListeners('onAfterTargetToProxyHeadersReceived', protocolResponse.status, this.response.getHeaders());
            } catch (e) {
                if (e instanceof WebApplicationException) {
                    this.handleWebApplicationException(e);
                }
            }

            this.bytesSent += message.length;
        }
    }

    onBinary(byteBuffer, isLast) {
        if (!this.hasResponse || this.webSocket.readyState === WebSocket.CLOSING || this.webSocket.readyState === WebSocket.CLOSED) {
            console.error("Received binary message from connector but hasResponse=false or socket is closing/closed");
            return;
        }

        this.binaryFramesReceived++;
        const len = byteBuffer.length;

        if (len === 0) {
            console.warn(`routerName=${this.route}, routerSocketID=${this.routerSocketID}, received 0 bytes to send to ${this.remoteAddress}`);
        } else {
            console.debug(`routerName=${this.route}, routerSocketID=${this.routerSocketID}, sending ${len} bytes to client`);

            this.asyncHandle.write(byteBuffer, (error) => {
                if (error) {
                    console.info(`routerName=${this.route}, routerSocketID=${this.routerSocketID}, could not write to client response (maybe the user closed their browser) so will cancel the request. Error message: ${error.message}`);
                } else {
                    this.bytesSent += len;
                }

                this.notifyProxyListeners('onResponseBodyChunkReceivedFromTarget', byteBuffer);
            });
        }
    }

    sendText(message) {
        this.bytesReceived += message.length;
        if (this.webSocket) {
            this.webSocket.send(message);
        }
    }

    sendData(bb, callback) {
        this.bytesReceived += bb.length;
        if (this.webSocket) {
            this.webSocket.send(bb, callback);
        }
    }

    removeBadWebSocket() {
        if (!this.isRemoved) {
            this.socketSessionClose();
            this.webSocketFarm.removeWebSocketAsync(this.route, this, () => {});
            this.isRemoved = true;
        }
    }

    connectorInstanceID() {
        return this.connectorInstanceID;
    }

    setOnReadyForAction(onReadyForAction) {
        this.onReadyForAction = onReadyForAction;
    }

    serviceAddress() {
        return this.remoteAddress;
    }

    putHeadersTo(protocolResponse) {
        this.response.removeHeader('date');
        for (const [header, value] of Object.entries(protocolResponse.headers)) {
            const lowerHeader = header.toLowerCase();
            if (!RouterSocket.HOP_BY_HOP.includes(lowerHeader) && !RouterSocket.RESPONSE_HEADERS_TO_NOT_SEND_BACK.includes(lowerHeader)) {
                this.response.setHeader(lowerHeader, value);
            }
        }

        const connectionHeader = this.response.getHeader('connection');
        if (connectionHeader) {
            const customHopByHop = RouterSocket.getCustomHopByHopHeaders(connectionHeader);
            for (const header of customHopByHop) {
                this.response.removeHeader(header);
            }
        }
    }

    setAsyncHandle(asyncHandle, clientRequest, response, socketWaitInMillis) {
        this.clientRequest = clientRequest;
        this.socketWaitInMillis = socketWaitInMillis;
        this.hasResponse = true;
        this.response = response;
        this.asyncHandle = asyncHandle;
        asyncHandle.on('finish', (info) => {
            if (!info.completedSuccessfully && this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
                console.log("Closing socket because client request did not complete successfully");
                this.socketSessionClose();
                this.raiseCompletionEvent();
            }
        });
    }

    isDarkModeOn(darkHosts) {
        return darkHosts.some(darkHost => darkHost.sameHost(this.serviceAddress()));
    }

    getProtocol() {
        return "cranker_1.0";
    }

    notifyProxyListeners(event, ...args) {
        for (const listener of this.proxyListeners) {
            if (typeof listener[event] === 'function') {
                listener[event](this, ...args);
            }
        }
    }

    raiseCompletionEvent() {
        if (this.clientRequest) {
            this.durationMillis = Date.now() - this.clientRequest.startTime;
            this.notifyProxyListeners('onComplete');
        }
    }

    parseProtocolResponse(message) {
        const lines = message.split('\n');
        const [_, status] = lines[0].split(' ');
        const headers = {};
        for (let i = 1; i < lines.length; i++) {
            const [key, value] = lines[i].split(':');
            if (key && value) {
                headers[key.trim()] = value.trim();
            }
        }
        return { status: parseInt(status), headers };
    }

    handleWebApplicationException(error) {
        this.response.status(error.status).send(error.message);
    }

    sendSimpleResponse(status, header, htmlBody) {
        this.response.status(status).send(`
            <html>
                <head><title>${header}</title></head>
                <body>
                    <h1>${header}</h1>
                    <p>${htmlBody}</p>
                </body>
            </html>
        `);
    }

    static HOP_BY_HOP = new Set([
        'keep-alive', 'transfer-encoding', 'te', 'connection', 'trailer', 'upgrade',
        'proxy-authorization', 'proxy-authenticate'
    ]);

    static RESPONSE_HEADERS_TO_NOT_SEND_BACK = ['server'];

    static getCustomHopByHopHeaders(connectionHeaderValue) {
        if (!connectionHeaderValue) return [];
        return connectionHeaderValue.split(',').map(h => h.trim().toLowerCase());
    }
}

class WebApplicationException extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

module.exports = RouterSocket;