const ProxyListener = require('./ProxyListener');
const DarkModeManager = require('./DarkModeManager');
const http = require('http');
const url = require('url');

class CrankerRouter {
  constructor(builder) {
    this.builder = builder;
    this.routes = new Map();
    this.connectors = new Map();
    this.proxyListeners = builder.proxyListeners || [];
    this.darkModeManager = new DarkModeManager();
  }

  proxyRequest(clientReq, clientRes, connectorSocket) {
    const startTime = Date.now();
    const proxyInfo = {
      clientRequest: clientReq,
      clientResponse: clientRes,
      targetRequest: null,
      targetResponse: null,
      route: clientReq.url.split('/')[1],
      duration: 0,
      bytesSent: 0,
      bytesReceived: 0,
      error: null
    };

    const requestHeadersToTarget = this.processRequestHeaders(clientReq.headers);

    // Check if dark mode is enabled for this host
    const host = requestHeadersToTarget['host'];
    if (this.darkModeManager.isDarkModeEnabledFor(host)) {
      this.handleDarkMode(clientRes);
      return;
    }

    // Call onBeforeProxyToTarget listeners
    for (const listener of this.proxyListeners) {
      try {
        listener.onBeforeProxyToTarget(proxyInfo, requestHeadersToTarget);
      } catch (error) {
        if (error instanceof WebApplicationException) {
          this.handleWebApplicationException(error, clientRes);
          return;
        }
        this.handleProxyError(clientRes, error);
        return;
      }
    }

    const proxyReq = {
      method: clientReq.method,
      headers: requestHeadersToTarget,
      url: clientReq.url
    };

    connectorSocket.send(JSON.stringify(proxyReq));

    connectorSocket.on('message', (message) => {
      try {
        const response = JSON.parse(message);
        proxyInfo.targetResponse = response;

        // Call onAfterTargetToProxyHeadersReceived listeners
        for (const listener of this.proxyListeners) {
          listener.onAfterTargetToProxyHeadersReceived(proxyInfo, response.statusCode, response.headers);
        }

        this.processResponseHeaders(clientRes, response.headers);

        // Call onBeforeRespondingToClient listeners
        for (const listener of this.proxyListeners) {
          listener.onBeforeRespondingToClient(proxyInfo);
        }

        clientRes.writeHead(response.statusCode, response.headers);
        clientRes.end(response.body);

        proxyInfo.duration = Date.now() - startTime;
        proxyInfo.bytesSent = Buffer.byteLength(response.body);

        // Call onAfterResponseSent listeners
        for (const listener of this.proxyListeners) {
          listener.onAfterResponseSent(proxyInfo);
        }
      } catch (error) {
        this.handleProxyError(clientRes, error);
      }
    });

    clientReq.on('data', (chunk) => {
      proxyInfo.bytesReceived += chunk.length;
      connectorSocket.send(JSON.stringify({ type: 'data', data: chunk.toString('base64') }));
    });

    clientReq.on('end', () => {
      connectorSocket.send(JSON.stringify({ type: 'end' }));
    });

    connectorSocket.on('error', (error) => {
      proxyInfo.error = error;
      for (const listener of this.proxyListeners) {
        listener.onProxyError(proxyInfo, error);
      }
      this.handleProxyError(clientRes, error);
    });
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

    // Add Via header
    const viaValue = `${http.STATUS_CODES[200]} ${this.builder.viaName}`;
    if (processedHeaders['via']) {
      processedHeaders['via'] += `, ${viaValue}`;
    } else {
      processedHeaders['via'] = viaValue;
    }

    // Add Forwarded header
    const forwardedValue = this.generateForwardedHeader(headers);
    if (processedHeaders['forwarded']) {
      processedHeaders['forwarded'] += `, ${forwardedValue}`;
    } else {
      processedHeaders['forwarded'] = forwardedValue;
    }

    if (this.builder.sendLegacyForwardedHeaders) {
      this.addLegacyForwardedHeaders(processedHeaders, headers);
    }

    return processedHeaders;
  }

  generateForwardedHeader(headers) {
    const parts = [];
    if (headers['x-forwarded-for']) {
      parts.push(`for=${headers['x-forwarded-for']}`);
    }
    if (headers['x-forwarded-proto']) {
      parts.push(`proto=${headers['x-forwarded-proto']}`);
    }
    if (headers['host']) {
      parts.push(`host=${headers['host']}`);
    }
    return parts.join(';');
  }

  addLegacyForwardedHeaders(processedHeaders, originalHeaders) {
    if (originalHeaders['x-forwarded-for']) {
      processedHeaders['x-forwarded-for'] = originalHeaders['x-forwarded-for'];
    }
    if (originalHeaders['x-forwarded-proto']) {
      processedHeaders['x-forwarded-proto'] = originalHeaders['x-forwarded-proto'];
    }
    if (originalHeaders['x-forwarded-host']) {
      processedHeaders['x-forwarded-host'] = originalHeaders['x-forwarded-host'];
    }
  }

  processResponseHeaders(clientRes, headers) {
    // Remove hop-by-hop headers
    const hopByHopHeaders = [
      'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
      'te', 'trailers', 'transfer-encoding', 'upgrade'
    ];

    hopByHopHeaders.forEach(header => {
      delete headers[header];
    });

    // Add Via header to response
    const viaValue = `${clientRes.httpVersion} ${this.builder.viaName}`;
    if (headers['via']) {
      headers['via'] += `, ${viaValue}`;
    } else {
      headers['via'] = viaValue;
    }
  }


  handleWebApplicationException(error, response) {
    response.writeHead(error.statusCode, { 'Content-Type': 'text/plain' });
    response.end(error.message);
  }

  handleProxyError(response, error) {
    console.error('Proxy error:', error);
    response.writeHead(502, { 'Content-Type': 'text/plain' });
    response.end('Proxy Error: ' + error.message);
  }
  
  darkModeManager() {
    return this.darkModeManager;
  }

  stop() {
    for (const socket of this.connectors.values()) {
      socket.close();
    }
    this.connectors.clear();
    this.routes.clear();
  }

  static muCrankerVersion() {
    return require('../package.json').version;
  }
}

class WebApplicationException extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = CrankerRouter;