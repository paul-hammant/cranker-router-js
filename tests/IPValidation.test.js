const https = require('https');
const axios = require('axios');
const fs = require('fs');
const http = require('http');
const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnector, waitForRegistration, preferredProtocols } = require('./testUtils');
const IPValidator = require("../src/utils/IPValidator");

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

  const setupServers = async (ipValidator) => {
    targetServer = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200);
        res.end('hello');
      }
    });
    await new Promise(resolve => targetServer.listen(0, resolve));

    crankerRouter = new CrankerRouterBuilder()
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withRegistrationIpValidator(ipValidator)
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
  };

  test.each([1, 2, 3])('registrationServerCanHaveIPWhiteListing (repetition %i)', async (repetitionInfo) => {
    const allowThem = { value: false };
    await setupServers(() => allowThem.value);

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
  }, 30000);

  test('registrationServerCanHaveIPWhiteListing with dynamic changes', async () => {
    let isAllowed = false;
    await setupServers(() => isAllowed);

    // Initial connection should fail
    await expect(startConnector('*', '*', ['cranker_1.0'], targetServer, router))
      .rejects.toThrow('Unexpected server response: 403');

    // Change to allow connections
    isAllowed = true;

    // Now connection should succeed
    connector = await startConnector('*', '*', ['cranker_1.0'], targetServer, router);
    await waitForRegistration('*', connector.connectorId(), 2, [crankerRouter]);

    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    // HTTP request should succeed
    let response = await axios.get(`https://localhost:${router.address().port}/`, { httpsAgent });
    expect(response.status).toBe(200);

    // Change back to disallow connections
    isAllowed = false;

    // Existing connections should still work
    response = await axios.get(`https://localhost:${router.address().port}/`, { httpsAgent });
    expect(response.status).toBe(200);

    // But new connections should fail
    await expect(startConnector('*', '*', ['cranker_1.0'], targetServer, router))
      .rejects.toThrow('Unexpected server response: 403');
  });

  test('IP validation with specific IP address', async () => {
    const allowedIp = '127.0.0.1';
    await setupServers(IPValidator.create([allowedIp]).allow);

    // Connection from allowed IP should succeed
    connector = await startConnector('*', '*', ['cranker_1.0'], targetServer, router);
    await waitForRegistration('*', connector.connectorId(), 2, [crankerRouter]);

    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    // HTTP request should succeed
    const response = await axios.get(`https://localhost:${router.address().port}/`, { httpsAgent });
    expect(response.status).toBe(200);

    // Connection from different IP should fail
    const differentIp = '192.168.1.1';
    await expect(startConnector('*', '*', ['cranker_1.0'], targetServer, router, differentIp))
      .rejects.toThrow('Unexpected server response: 403');
  });
});
