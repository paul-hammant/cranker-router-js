//
// Usage
// =====
//
// ```
// const { ProxyListener, WebApplicationException } = require('./ProxyListener');
//
// class MyProxyListener extends ProxyListener {
//   async onBeforeProxyToTarget(info, requestHeadersToTarget) {
//     console.log(`Proxying request to ${info.route}`);
//     if (info.clientRequest.headers['x-block-request']) {
//       throw new WebApplicationException(403, 'Request blocked by proxy');
//     }
//   }
//
//   async onComplete(proxyInfo) {
//     console.log(`Request completed in ${proxyInfo.duration}ms`);
//   }
//
//   // Override other methods as needed...
// }
//
// module.exports = MyProxyListener;
// ```
//
//Then, you would add an instance of this listener to your CrankerRouter:
//
// ```
// const MyProxyListener = require('./MyProxyListener');
// const { CrankerRouterBuilder } = require('./CrankerRouterBuilder');
//
// const router = CrankerRouterBuilder.crankerRouter()
//   .withProxyListeners([new MyProxyListener()])
// // ... other configuration ...
//   .build();
// ```

class ProxyListener {
  /**
   * Called before sending a request to the target service.
   * @param {ProxyInfo} info Information about the request and response.
   * @param {Object} requestHeadersToTarget The headers that will be sent to the target.
   * @throws {WebApplicationException} Throw to send an error to the client rather than proxying the request.
   */
  async onBeforeProxyToTarget(info, requestHeadersToTarget) {}

  /**
   * Called after receiving headers from the target, before sending the response to the client.
   * @param {ProxyInfo} info Information about the request and response.
   * @param {number} statusCode The status code received from the target.
   * @param {Object} responseHeaders The headers received from the target.
   * @throws {WebApplicationException} Throw to send an error to the client rather than proxying the response.
   */
  async onAfterTargetToProxyHeadersReceived(info, statusCode, responseHeaders) {}

  /**
   * Called before sending the response to the client.
   * @param {ProxyInfo} info Information about the request and response.
   * @throws {WebApplicationException} Throw to send an error to the client rather than proxying the response.
   */
  async onBeforeRespondingToClient(info) {}

  /**
   * Called after a response has been completed.
   * @param {ProxyInfo} proxyInfo Information about the response.
   */
  async onComplete(proxyInfo) {}

  /**
   * Called if a free socket could not be found for the target.
   * @param {ProxyInfo} proxyInfo Information about the request.
   */
  async onFailureToAcquireProxySocket(proxyInfo) {}

  /**
   * Called after the request headers have been sent to the target.
   * @param {ProxyInfo} info Information about the request and response.
   * @param {Object} headers The headers that were sent to the target.
   * @throws {WebApplicationException} Throw to send an error to the client and stop the proxy process.
   */
  async onAfterProxyToTargetHeadersSent(info, headers) {}

  /**
   * Called when a chunk of request body data is sent to the target.
   * @param {ProxyInfo} info Information about the request and response.
   * @param {Buffer} chunk Request body data which has been sent to target.
   */
  async onRequestBodyChunkSentToTarget(info, chunk) {}

  /**
   * Called when the full request body has been sent to the target.
   * @param {ProxyInfo} info Information about the request and response.
   */
  async onRequestBodySentToTarget(info) {}

  /**
   * Called when a chunk of response body data is received from the target.
   * @param {ProxyInfo} info Information about the request and response.
   * @param {Buffer} chunk Response body data received from the target.
   */
  async onResponseBodyChunkReceivedFromTarget(info, chunk) {}

  /**
   * Called when the full response body has been received from the target.
   * @param {ProxyInfo} info Information about the request and response.
   */
  async onResponseBodyChunkReceived(info) {}

  /**
   * Called if there's an error during the proxy process.
   * @param {ProxyInfo} info Information about the request and response.
   * @param {Error} error The error that occurred.
   */
  async onProxyError(info, error) {}
}

class WebApplicationException extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'WebApplicationException';
    this.statusCode = statusCode;
  }
}

module.exports = { ProxyListener, WebApplicationException };