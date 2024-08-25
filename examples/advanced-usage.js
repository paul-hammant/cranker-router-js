const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const ProxyListener = require('../src/ProxyListener');
const http = require('http');

class AdvancedProxyListener extends ProxyListener {
  onBeforeProxyToTarget(proxyInfo, requestHeadersToTarget) {
    console.log('Before proxying to target:', requestHeadersToTarget);
    // Example of throwing a WebApplicationException
    if (requestHeadersToTarget['x-block-request']) {
      throw new WebApplicationException(403, 'Request blocked by proxy listener');
    }
  }

  onAfterTargetToProxyHeadersReceived(proxyInfo, statusCode, responseHeaders) {
    console.log('After receiving headers from target:', statusCode, responseHeaders);
  }

  onBeforeRespondingToClient(proxyInfo) {
    console.log('Before responding to client:', proxyInfo.clientResponse.statusCode);
  }

  onAfterResponseSent(proxyInfo) {
    console.log('After response sent:', proxyInfo.duration, 'ms');
  }

  onProxyError(proxyInfo, error) {
    console.error('Proxy error:', error);
  }
}

const router = new CrankerRouterBuilder()
  .withDiscardClientForwardedHeaders(true)
  .withIdleTimeout(300, 'seconds')
  .withRegistrationIpValidator((ip) => ip === '127.0.0.1')
  .withProxyListeners([new AdvancedProxyListener()])
  .build();

// Enable dark mode for a specific host
router.darkModeManager().enableDarkModeFor('example.com');

const server = http.createServer();
server.on('upgrade', router.createRegistrationHandler());
server.on('request', router.createHttpHandler());
server.listen(8080, () => {
  console.log('Advanced Cranker Router is running on http://localhost:8080');
  console.log('MuCranker version:', CrankerRouter.muCrankerVersion());
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close(() => {
    router.stop();
    console.log('Server stopped');
    process.exit(0);
  });
});
