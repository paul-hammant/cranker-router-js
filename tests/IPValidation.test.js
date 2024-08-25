// In IPValidation.test.js
const https = require('https');
const axios = require('axios');
const fs = require('fs');
const http = require('http');
const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnector, waitForRegistration, preferredProtocols } = require('./testUtils');

jest.setTimeout(30000);

describe('IPValidationTest', () => {
  let targetServer;
  let crankerRouter;
  let router;
  let connector;

  afterEach(async () => {
    if (connector) await connector.stop();
    if (router) await new Promise(resolve => router.close(resolve));
    if (targetServer) await new Promise(resolve => targetServer.close(resolve));
    if (crankerRouter && crankerRouter.stop) await crankerRouter.stop();
  }, 15000);

  const testRegistrationServerCanHaveIPWhiteListing = async (repetitionInfo) => {
    const allowThem = { value: false };

    targetServer = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200);
        res.end('hello');
      }
    });
    await new Promise(resolve => targetServer.listen(0, resolve));

    crankerRouter = new CrankerRouterBuilder()
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withRegistrationIpValidator(() => allowThem.value)
      .withConnectorMaxWaitInMillis(400)
      .build();

    const httpsOptions = {
      key: fs.readFileSync('test_resources/key.pem'),
      cert: fs.readFileSync('test_resources/cert.pem')
    };

    router = https.createServer(httpsOptions, (req, res) => {
      if (req.url.startsWith('/register')) {
        crankerRouter.createRegistrationHandler()(req, res);
      } else {
        crankerRouter.createHttpHandler()(req, res);
      }
    });
    await new Promise(resolve => router.listen(0, resolve));

    // First connection should fail
    await expect(startConnector('*', '*', preferredProtocols(repetitionInfo), targetServer, router))
      .rejects.toThrow('Unexpected server response: 403');

    // Allow connections
    allowThem.value = true;

    // Second connection should succeed
    connector = await startConnector('*', '*', preferredProtocols(repetitionInfo), targetServer, router);
    expect(connector.connectorId()).toBe('mock-connector-id');

    await waitForRegistration('*', connector.connectorId(), 2, [crankerRouter]);

    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    // HTTP request should succeed
    const response = await axios.get(`https://localhost:${router.address().port}/`, { httpsAgent });
    expect(response.status).toBe(200);
  };

  test.each([1, 2, 3])('registrationServerCanHaveIPWhiteListing (repetition %i)', testRegistrationServerCanHaveIPWhiteListing, 30000);
});