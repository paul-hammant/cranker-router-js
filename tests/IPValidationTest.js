const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { createServer } = require('http');
const { call, request } = require('./utils/ClientUtils');
const { expect } = require('@jest/globals');

describe('IPValidationTest', () => {
  let targetServer;
  let crankerRouter;
  let router;
  let connector;

  beforeEach(() => {
    targetServer = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('hello');
      } else {
        res.writeHead(404);
        res.end();
      }
    }).listen(0);

    crankerRouter = new CrankerRouterBuilder()
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withRegistrationIpValidator(() => false)
      .withConnectorMaxWaitInMillis(400)
      .start();

    router = createServer((req, res) => {
      crankerRouter.createRegistrationHandler()(req, res);
      crankerRouter.createHttpHandler()(req, res);
    }).listen(0);

    connector = startConnector('*', '*', ['cranker_1.0'], targetServer, router);
  });

  afterEach(() => {
    targetServer.close();
    router.close();
    connector.close();
  });

  test('registrationServerCanHaveIPWhiteListing', async () => {
    let response = await call(request(router.address()));
    expect(response.statusCode).toBe(404);

    crankerRouter.withRegistrationIpValidator(() => true);
    await waitForRegistration('*', connector.connectorId(), 2, [crankerRouter]);

    response = await call(request(router.address()));
    expect(response.statusCode).toBe(200);
  });
});
