const CrankerRouter = require('./CrankerRouter');
const dns = require('dns').promises;
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');

class CrankerRouterBuilder {
  constructor() {
    this.supportedCrankerProtocols = [];
    this.registrationIpValidator = null;
    this.connectorMaxWaitInMillis = 5000; // Default value, adjust as needed
    this.discardClientForwardedHeaders = false;
    this.sendLegacyForwardedHeaders = false;
    this.viaName = 'muc';
    this.idleReadTimeoutMs = 5 * 60 * 1000; // 5 minutes
    this.routesKeepTimeMs = 2 * 60 * 60 * 1000; // 2 hours
    this.pingAfterWriteMs = 10 * 1000; // 10 seconds
    this.proxyHostHeader = true;
    this.ipValidator = () => true; // Allow all by default
    this.proxyListeners = [];
    this.wss = new WebSocket.Server({ noServer: true });
  }

  withSupportedCrankerProtocols(protocols) {
    this.supportedCrankerProtocols = protocols;
    return this;
  }

  withRegistrationIpValidator(validator) {
    this.registrationIpValidator = validator;
    return this;
  }

  withConnectorMaxWaitInMillis(millis) {
    this.connectorMaxWaitInMillis = millis;
    return this;
  }

  withDiscardClientForwardedHeaders(discard) {
    this.discardClientForwardedHeaders = discard;
    return this;
  }

  withSendLegacyForwardedHeaders(send) {
    this.sendLegacyForwardedHeaders = send;
    return this;
  }

  withViaName(name) {
    if (!/^[0-9a-zA-Z!#$%&'*+-.^_`|~:]+$/.test(name)) {
      throw new Error('Via names must be hostnames or HTTP header tokens');
    }
    this.viaName = name;
    return this;
  }

  withIdleTimeout(duration, unit) {
    if (duration < 0) {
      throw new Error('The duration must be 0 or greater');
    }
    this.idleReadTimeoutMs = duration * (unit === 'seconds' ? 1000 : 1);
    return this;
  }

  withRoutesKeepTime(duration, unit) {
    if (duration < 0) {
      throw new Error('The duration must be 0 or greater');
    }
    this.routesKeepTimeMs = duration * (unit === 'seconds' ? 1000 : 1);
    return this;
  }

  withPingSentAfterNoWritesFor(duration, unit) {
    if (duration < 0) {
      throw new Error('The duration must be 0 or greater');
    }
    this.pingAfterWriteMs = duration * (unit === 'seconds' ? 1000 : 1);
    return this;
  }

  proxyHostHeader(send) {
    this.proxyHostHeader = send;
    return this;
  }

  withRegistrationIpValidator(validator) {
    this.ipValidator = validator;
    return this;
  }

  withProxyListeners(listeners) {
    this.proxyListeners = listeners;
    return this;
  }

  static MuCranker = {
    artifactVersion: () => {
      // Implement version retrieval logic here
      // For example, you could read it from a package.json file
      return require('../package.json').version;
    }
  };

  build() {
    return {
      createRegistrationHandler: () => {
        return (req, res) => {
          if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
            if (!this.ipValidator(req.socket.remoteAddress)) {
              res.writeHead(403);
              res.end('IP not allowed');
            } else {
              this.wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
                this.wss.emit('connection', ws, req);
              });
            }
          } else {
            if (!this.ipValidator(req.socket.remoteAddress)) {
              res.writeHead(403);
              res.end('IP not allowed');
            } else {
              res.writeHead(200);
              res.end('Registration handled');
            }
          }
        };
      },
      createHttpHandler: () => {
        return (req, res) => {
          res.writeHead(200);
          res.end('HTTP request handled');
        };
      },
      stop: async () => {
        return new Promise((resolve) => {
          this.wss.close(resolve);
        });
      }
    };
  }}

class DarkHost {
  constructor(address, dateEnabled, reason) {
    this.addr = address;
    this.dateEnabled = dateEnabled;
    this.reason = reason;
  }

  static async create(address, dateEnabled, reason) {
    // Resolve the address if it's a hostname
    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(address)) {
      try {
        const result = await dns.lookup(address);
        address = result.address;
      } catch (error) {
        console.error(`Failed to resolve hostname: ${address}`);
      }
    }
    return new DarkHost(address, dateEnabled, reason);
  }

  address() {
    return this.addr;
  }

  async sameHost(otherAddress) {
    // Resolve the other address if it's a hostname
    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(otherAddress)) {
      try {
        const result = await dns.lookup(otherAddress);
        otherAddress = result.address;
      } catch (error) {
        console.error(`Failed to resolve hostname: ${otherAddress}`);
        return false;
      }
    }

    // Compare IP addresses
    return this.addr === otherAddress ||
      (this.addr === '127.0.0.1' && otherAddress === '::1') ||
      (this.addr === '::1' && otherAddress === '127.0.0.1');
  }

  toMap() {
    return {
      address: this.addr,
      dateEnabled: this.dateEnabled,
      reason: this.reason
    };
  }
}

class FavIconHandler {
  constructor(favicon) {
    this.favicon = favicon;
  }

  static async fromClassPath(iconPath) {
    try {
      const favicon = await fs.readFile(iconPath);
      return new FavIconHandler(favicon);
    } catch (error) {
      throw new Error(`Failed to read favicon from ${iconPath}: ${error.message}`);
    }
  }

  async handle(req, res) {
    res.writeHead(200, {
      'Content-Type': 'image/x-icon',
      'Content-Length': this.favicon.length,
      'Cache-Control': 'max-age=360000,public'
    });
    res.end(this.favicon);
  }
}

module.exports = {
  FavIconHandler, DarkHost, CrankerRouterBuilder };