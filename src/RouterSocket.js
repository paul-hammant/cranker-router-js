const { v4: uuidv4 } = require('uuid');

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
    }

    isCatchAll() {
        return this.route === '*';
    }

    socketSessionClose() {
        // Implement socket session close logic
    }

    onConnect(session) {
        this.remoteAddress = session.remoteAddress;
        if (this.onReadyForAction) {
            this.onReadyForAction();
        }
    }

    onClientClosed(statusCode, reason) {
        // Implement client closed logic
    }

    onError(cause) {
        this.error = cause;
        // Implement error handling logic
    }

    onText(message, isLast, doneCallback) {
        // Implement text message handling logic
    }

    onBinary(byteBuffer, isLast, doneCallback) {
        // Implement binary message handling logic
    }

    sendText(message) {
        this.bytesReceived += message.length;
        // Implement send text logic
    }

    sendData(bb, callback) {
        this.bytesReceived += bb.length;
        // Implement send data logic
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
        // Implement header handling logic
    }

    setAsyncHandle(asyncHandle, clientRequest, response, socketWaitInMillis) {
        this.clientRequest = clientRequest;
        this.socketWaitInMillis = socketWaitInMillis;
        this.hasResponse = true;
        this.response = response;
        this.asyncHandle = asyncHandle;
        // Implement async handle logic
    }

    isDarkModeOn(darkHosts) {
        return darkHosts.some(darkHost => darkHost.sameHost(this.serviceAddress()));
    }

    getProtocol() {
        return "cranker_1.0";
    }

    route() {
        return this.route;
    }

    request() {
        return this.clientRequest;
    }

    response() {
        return this.response;
    }

    durationMillis() {
        return this.durationMillis;
    }

    bytesReceived() {
        return this.bytesReceived;
    }

    bytesSent() {
        return this.bytesSent;
    }

    responseBodyFrames() {
        return this.binaryFramesReceived;
    }

    errorIfAny() {
        return this.error;
    }

    socketWaitInMillis() {
        return this.socketWaitInMillis;
    }
}

module.exports = RouterSocket;
