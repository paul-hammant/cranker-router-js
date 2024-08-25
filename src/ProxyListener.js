class ProxyListener {
  onBeforeProxyToTarget(proxyInfo, requestHeadersToTarget) {}
  onAfterTargetToProxyHeadersReceived(proxyInfo, statusCode, responseHeaders) {}
  onBeforeRespondingToClient(proxyInfo) {}
  onAfterResponseSent(proxyInfo) {}
  onProxyError(proxyInfo, error) {}
}

module.exports = ProxyListener;
