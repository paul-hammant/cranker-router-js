const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const WebSocketFarm = require('./WebSocketFarm');
const DarkModeManager = require('./DarkModeManager');
const RouterSocket = require('./RouterSocket');
const RouterSocketV3 = require('./RouterSocketV3');

class CrankerRouter {
  constructor(builder) {
    this.builder = builder;
    this.routes = new Set();
    this.webSocketFarm = new WebSocketFarm(this.builder);
    this.webSocketFarmV3 = new WebSocketFarm(this.builder);
    this.proxyListeners = builder.proxyListeners || [];
    this.darkModeManager = new DarkModeManager();
    this.httpServer = null;
    this.wsServer = null;
  }

  async start() {
    await this.webSocketFarm.start();
    await this.webSocketFarmV3.start();
    this.httpServer = http.createServer(this.handleHttpRequest.bind(this));
    this.wsServer = new WebSocket.Server({ noServer: true });
    this.httpServer.on('upgrade', this.handleUpgrade.bind(this));
  }

  async stop() {
    if (this.httpServer) {
      await new Promise(resolve => this.httpServer.close(resolve));
    }
    if (this.wsServer) {
      await new Promise(resolve => this.wsServer.close(resolve));
    }
    await this.webSocketFarm.stop();
    await this.webSocketFarmV3.stop();
  }

  createRegistrationHandler() {
    return async (req, res) => {
      if (!this.builder.ipValidator(req.socket.remoteAddress)) {
        res.writeHead(403);
        res.end('IP not allowed');
        return;
      }

      if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
        // WebSocket upgrade will be handled in handleUpgrade method
        return;
      }

      res.writeHead(200);
      const route = req.headers['route'];
      if (route) {
        this.routes.add(route);
      }
      res.end('Registration handled');
    };
  }

  createHttpHandler() {
    return this.handleHttpRequest.bind(this);
  }

  async handleHttpRequest(req, res) {
    const startTime = Date.now();
    const proxyInfo = this.createProxyInfo(req, res);

    try {
      const route = this.builder.routeResolver.resolve(this.routes.keys(), req.url);
      const socket = await this.getSocket(route).catch(() => null);
      if (!socket) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Service Unavailable');
        return;
      }
      await this.proxyRequest(req, res, socket, proxyInfo);
    } catch (error) {
      this.handleProxyError(res, error, proxyInfo);
    } finally {
      proxyInfo.duration = Date.now() - startTime;
      await this.notifyProxyListeners('onComplete', proxyInfo);
    }
  }

  async handleUpgrade(request, socket, head) {
    if (!this.builder.ipValidator(socket.remoteAddress)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    this.wsServer.handleUpgrade(request, socket, head, ws => {
      this.handleWebSocketConnection(ws, request);
    });
  }

  async handleWebSocketConnection(ws, request) {
    const route = request.headers['route'] || '*';
    const protocol = this.negotiateProtocol(request);

    if (protocol === 'cranker_3.0') {
      const routerSocket = new RouterSocketV3(route, request.headers['component-name'], this.webSocketFarmV3, request.socket.remotePort, this.proxyListeners, this.builder.discardClientForwardedHeaders, this.builder.sendLegacyForwardedHeaders, this.builder.viaName, this.builder.doNotProxy);
      routerSocket.onConnect(ws);
      await this.webSocketFarmV3.addWebSocket(route, routerSocket);
    } else {
      const routerSocket = new RouterSocket(route, request.headers['component-name'], this.webSocketFarm, request.socket.remotePort, this.proxyListeners);
      routerSocket.onConnect(ws);
      await this.webSocketFarm.addWebSocket(route, routerSocket);
    }
  }

  negotiateProtocol(request) {
    const protocols = request.headers['sec-websocket-protocol'];
    if (protocols) {
      const supportedProtocols = protocols.split(',').map(p => p.trim());
      if (supportedProtocols.includes('cranker_3.0')) return 'cranker_3.0';
      if (supportedProtocols.includes('cranker_1.0')) return 'cranker_1.0';
    }
    return 'cranker_1.0'; // Default to 1.0 if no supported protocol is found
  }

  async proxyRequest(clientReq, clientRes, connectorSocket, proxyInfo) {
    const requestHeadersToTarget = this.processRequestHeaders(clientReq.headers);

    if (this.darkModeManager.isDarkModeEnabledFor(requestHeadersToTarget['host'])) {
      this.handleDarkMode(clientRes);
      return;
    }

    await this.notifyProxyListeners('onBeforeProxyToTarget', proxyInfo, requestHeadersToTarget);

    const proxyReq = {
      method: clientReq.method,
      headers: requestHeadersToTarget,
      url: clientReq.url
    };

    connectorSocket.sendRequest(proxyReq, clientReq, clientRes, proxyInfo);
  }

  processRequestHeaders(headers) {
    const processedHeaders = { ...headers };

    if (this.builder.discardClientForwardedHeaders) {
      delete processedHeaders['forwarded'];
      delete processedHeaders['x-forwarded-for'];
      delete processedHeaders['x-forwarded-host'];
      delete processedHeaders['x-forwarded-proto'];
    }

    if (!this.builder.proxyHostHeader) {
      delete processedHeaders['host'];
    }

    this.addViaHeader(processedHeaders);
    this.addForwardedHeader(processedHeaders);

    if (this.builder.sendLegacyForwardedHeaders) {
      this.addLegacyForwardedHeaders(processedHeaders);
    }

    return processedHeaders;
  }

  addViaHeader(headers) {
    const viaValue = `${http.STATUS_CODES[200]} ${this.builder.viaName}`;
    if (headers['via']) {
      headers['via'] += `, ${viaValue}`;
    } else {
      headers['via'] = viaValue;
    }
  }

  addForwardedHeader(headers) {
    const forwardedValue = this.generateForwardedHeader(headers);
    if (headers['forwarded']) {
      headers['forwarded'] += `, ${forwardedValue}`;
    } else {
      headers['forwarded'] = forwardedValue;
    }
  }

  generateForwardedHeader(headers) {
    const parts = [];
    if (headers['x-forwarded-for']) parts.push(`for=${headers['x-forwarded-for']}`);
    if (headers['x-forwarded-proto']) parts.push(`proto=${headers['x-forwarded-proto']}`);
    if (headers['host']) parts.push(`host=${headers['host']}`);
    return parts.join(';');
  }

  addLegacyForwardedHeaders(headers) {
    if (headers['x-forwarded-for']) headers['x-forwarded-for'] = headers['x-forwarded-for'];
    if (headers['x-forwarded-proto']) headers['x-forwarded-proto'] = headers['x-forwarded-proto'];
    if (headers['x-forwarded-host']) headers['x-forwarded-host'] = headers['x-forwarded-host'];
  }

  handleDarkMode(response) {
    response.writeHead(503, { 'Content-Type': 'text/plain' });
    response.end('Service temporarily unavailable due to dark mode');
  }

  handleProxyError(response, error, proxyInfo) {
    console.error('Proxy error:', error);
    response.writeHead(502, { 'Content-Type': 'text/plain' });
    response.end('Proxy Error: ' + error.message);
    proxyInfo.error = error;
  }

  createProxyInfo(req, res) {
    return {
      clientRequest: req,
      clientResponse: res,
      route: this.resolveRoute(req.url),
      duration: 0,
      bytesSent: 0,
      bytesReceived: 0,
      error: null
    };
  }

  resolveRoute(requestUrl) {
    const parsedUrl = url.parse(requestUrl);
    const pathParts = parsedUrl.pathname.split('/');
    return pathParts[1] || '*';
  }

  async getSocket(route) {
    const socket = await this.webSocketFarm.getSocket(route) || await this.webSocketFarmV3.getSocket(route);
    if (!socket) {
      throw new Error(`No available socket for route: ${route}`);
    }
    return socket;
  }

  async notifyProxyListeners(event, ...args) {
    for (const listener of this.proxyListeners) {
      if (typeof listener[event] === 'function') {
        await listener[event](...args);
      }
    }
  }

  idleConnectionCount() {
    return this.webSocketFarm.idleCount() + this.webSocketFarmV3.idleCount();
  }

  collectInfo() {
    return {
      services: this.getServices(),
      darkHosts: this.darkModeManager.getAllDarkModeHosts(),
      waitingTasks: this.getWaitingTasks()
    };
  }

  getServices() {
    // Implement this method to return service information
  }

  getWaitingTasks() {
    // Implement this method to return waiting tasks information
  }


  static muCrankerVersion() {
    return require('../package.json').version;
  }
}

module.exports = CrankerRouter;
