const net = require('net');
const dns = require('dns');
const fs = require('fs');
const CrankerRouter = require('./CrankerRouter');
const IPValidator = require('./utils/IPValidator');
const LongestFirstRouteResolver = require('./LongestFirstRouteResolver');

class CrankerRouterBuilder {
  constructor() {
    this.supportedCrankerProtocols = ['1.0', '3.0'];
    this.ipValidator = IPValidator.AllowAll;
    this.connectorMaxWaitInMillis = 5000;
    this.discardClientForwardedHeaders = false;
    this.sendLegacyForwardedHeaders = false;
    this.viaName = 'muc';
    this.idleReadTimeoutMs = 5 * 60 * 1000; // 5 minutes
    this.routesKeepTimeMs = 2 * 60 * 60 * 1000; // 2 hours
    this.pingAfterWriteMs = 10 * 1000; // 10 seconds
    this.proxyHostHeader = true;
    this.proxyListeners = [];
    this.routeResolver = new LongestFirstRouteResolver();
    this.ipValidator = () => true; // Default to allow all
  }

  withRegistrationIpValidator(validator) {
    if (typeof validator !== 'function') {
      throw new Error('IP validator must be a function');
    }
    this.ipValidator = validator;
    return this;
  }

  withSupportedCrankerProtocols(protocols) {
    this.supportedCrankerProtocols = protocols.map(p => p.replace('cranker_', ''));
    return this;
  }

  withRegistrationIpValidator(validator) {
    this.ipValidator = validator;
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

  withProxyListeners(listeners) {
    this.proxyListeners = listeners;
    return this;
  }

  withRouteResolver(resolver) {
    this.routeResolver = resolver;
    return this;
  }

  build() {
    if (this.supportedCrankerProtocols.length === 0) {
      throw new Error('No supported Cranker protocols specified');
    }

    return new CrankerRouter(this);
  }

  static crankerRouter() {
    return new CrankerRouterBuilder();
  }

  static get MuCranker() {
    return {
      artifactVersion: () => {
        return require('../package.json').version;
      }
    };
  }
}

class DarkHost {
  constructor(address, dateEnabled, reason) {
    this.address = address;
    this.dateEnabled = dateEnabled;
    this.reason = reason;
  }

  static async create(address, dateEnabled, reason) {
    // If address is not an IP, resolve it
    if (!net.isIP(address)) {
      try {
        const result = await dns.promises.lookup(address);
        address = result.address;
      } catch (error) {
        console.error(`Failed to resolve hostname: ${address}`);
      }
    }
    return new DarkHost(address, dateEnabled, reason);
  }

  sameHost(otherAddress) {
    return this.address === otherAddress ||
        (this.address === '127.0.0.1' && otherAddress === '::1') ||
        (this.address === '::1' && otherAddress === '127.0.0.1');
  }

  toMap() {
    return {
      address: this.address,
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
      const favicon = await fs.promises.readFile(iconPath);
      return new FavIconHandler(favicon);
    } catch (error) {
      throw new Error(`Failed to read favicon from ${iconPath}: ${error.message}`);
    }
  }

  handle(req, res) {
    if (req.url === '/favicon.ico' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'image/x-icon',
        'Content-Length': this.favicon.length,
        'Cache-Control': 'max-age=360000,public'
      });
      res.end(this.favicon);
      return true;
    }
    return false;
  }
}

module.exports = {
  CrankerRouterBuilder,
  DarkHost,
  FavIconHandler
};
