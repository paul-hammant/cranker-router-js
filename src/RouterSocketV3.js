const { v4: uuidv4 } = require('uuid');

class RouterSocketV3 {
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
    }

    onConnect(session) {
        this.remoteAddress = session.remoteAddress;
        if (this.onReadyForAction) {
            this.onReadyForAction();
        }
    }

    sendRequestOverWebSocketV3(clientRequest, clientResponse) {
        const requestId = ++this.idMaker;
        const asyncHandle = clientRequest.handleAsync();

        const context = {
            requestId,
            clientRequest,
            clientResponse,
            asyncHandle,
            error: null,
            isRstStreamSent: false,
            fromClientBytes: 0,
            toClientBytes: 0,
            durationMillis: 0,
        };
        this.contextMap.set(requestId, context);

        asyncHandle.addResponseCompleteHandler(info => {
            if (!info.completedSuccessfully()) {
                console.info("Client request did not complete successfully", clientRequest);
                if (!context.error) {
                    context.error = new Error("Client request did not complete successfully.");
                }
                this.raiseCompletionEvent(context);
                if (!this.state().endState()) {
                    this.resetStream(context, 1, "Client early closed");
                }
            }
        });

        // Implement the rest of the method logic
    }

    onBinary(byteBuffer, isLast, doneAndPullData, releaseBuffer) {
        const messageType = byteBuffer.get();
        const flags = byteBuffer.get();
        const requestId = byteBuffer.getInt();

        const context = this.contextMap.get(requestId);
        if (!context) {
            releaseBuffer();
            doneAndPullData(null);
            return;
        }

        switch (messageType) {
            case 0: // MESSAGE_TYPE_DATA
                // Implement data handling logic
                break;
            case 1: // MESSAGE_TYPE_HEADER
                // Implement header handling logic
                break;
            case 3: // MESSAGE_TYPE_RST_STREAM
                // Implement reset stream logic
                break;
            case 8: // MESSAGE_TYPE_WINDOW_UPDATE
                // Implement window update logic
                break;
            default:
                console.info("not supported binary message byte", messageType);
                releaseBuffer();
                doneAndPullData(null);
        }
    }

    resetStream(context, errorCode, message) {
        if (context && !context.isRstStreamSent) {
            // Implement reset stream logic
            context.isRstStreamSent = true;
        }
        if (context) {
            this.contextMap.delete(context.requestId);
        }
    }

    raiseCompletionEvent(context) {
        if (context && context.clientRequest && this.proxyListeners.length > 0) {
            context.durationMillis = Date.now() - context.clientRequest.startTime;
            this.proxyListeners.forEach(listener => {
                try {
                    listener.onComplete(context);
                } catch (e) {
                    console.warn("Error thrown by listener", e);
                }
            });
        }
    }

    state() {
        // Implement state logic
    }
}

module.exports = RouterSocketV3;
