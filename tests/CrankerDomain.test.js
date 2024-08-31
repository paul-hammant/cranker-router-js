// test/CrankerDomain.test.js

const { startRouterAndConnector, startConnectorAndWaitForRegistration } = require('./testUtils');
const http = require('http');

describe('CrankerDomain', () => {
  let crankerRouter, router, targetServer1, targetServer2, connector1, connector2;

  beforeEach(() => {
    // Setup code
  });

  afterEach(() => {
    // Cleanup code
  });

  test.each([1, 2, 3])('testRegisterWithDomainRouteAs (repetition %i)', async (repetition) => {
    const preferredProtocols = preferredProtocols(repetition);

    targetServer1 = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('localhost');
    }).listen(0);

    connector1 = await startConnectorAndWaitForRegistration(crankerRouter, 'localhost', '*', preferredProtocols, targetServer1, router);

    targetServer2 = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('127.0.0.1');
    }).listen(0);

    connector2 = await startConnectorAndWaitForRegistration(crankerRouter, '127.0.0.1', '*', preferredProtocols, targetServer2, router);

    // Test logic here
    // Use axios or another HTTP client to make requests and assert on the responses
  });
});