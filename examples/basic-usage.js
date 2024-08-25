const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const http = require('http');

const router = new CrankerRouterBuilder()
  .withDiscardClientForwardedHeaders(true)
  .withIdleTimeout(300, 'seconds')
  .withRegistrationIpValidator((ip) => ip === '127.0.0.1')
  .build();

const server = http.createServer();
server.on('upgrade', router.createRegistrationHandler());
server.on('request', router.createHttpHandler());
server.listen(8080, () => {
  console.log('Cranker Router is running on http://localhost:8080');
});
