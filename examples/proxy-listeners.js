const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const ProxyListener = require('../src/ProxyListener');
const http = require('http');

class LoggingProxyListener extends ProxyListener {
  onBeforeProxyToTarget(proxyInfo, requestHeadersToTarget) {
    console.log('Before proxying to target:', requestHeadersToTarget);
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
  .withProxyListeners([new LoggingProxyListener()])
  .build();

const server = http.createServer();
server.on('upgrade', router.createRegistrationHandler());
server.on('request', router.createHttpHandler());
server.listen(8080, () => {
  console.log('Cranker Router with proxy listeners is running on http://localhost:8080');
});
