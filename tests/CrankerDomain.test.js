// test/CrankerDomain.test.js
const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const axios = require('axios');
const fs = require('fs');

describe('CrankerDomain', () => {
  let crankerRouter, router, targetServer1, targetServer2, connector1, connector2;

  beforeEach(async () => {
    crankerRouter = new CrankerRouterBuilder()
      .withSendLegacyForwardedHeaders(true)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .build();

    router = https.createServer({
      key: fs.readFileSync('test_resources/key.pem'),
      cert: fs.readFileSync('test_resources/cert.pem')
    }, (req, res) => {
      if (req.url.startsWith('/register')) {
        crankerRouter.createRegistrationHandler()(req, res);
      } else {
        crankerRouter.createHttpHandler()(req, res);
      }
    }).listen(0);

    await new Promise(resolve => router.on('listening', resolve));
});

  afterEach(async () => {
    if (connector1) await connector1.stop();
    if (connector2) await connector2.stop();
    if (targetServer1) await new Promise(resolve => targetServer1.close(resolve));
    if (targetServer2) await new Promise(resolve => targetServer2.close(resolve));
    if (router) await new Promise(resolve => router.close(resolve));
    if (crankerRouter) await crankerRouter.stop();
  });

  test.each([1, 2, 3])('testRegisterWithDomainRouteAs (repetition %i)', async (repetition) => {
    const protocols = preferredProtocols({ repetition });
  }, 10000);

    targetServer1 = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('localhost');
    }).listen(0);

    targetServer2 = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('127.0.0.1');
    }).listen(0);

    await new Promise(resolve => router.on('listening', resolve));
    await Promise.all([
      new Promise(resolve => targetServer1.on('listening', resolve)),
      new Promise(resolve => targetServer2.on('listening', resolve))
    ]);

    connector1 = await startConnectorAndWaitForRegistration('localhost', targetServer1, protocols, '*', router);
    connector2 = await startConnectorAndWaitForRegistration('127.0.0.1', targetServer2, protocols, '*', router);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const localHostResults = {};
    const loopbackResults = {};

    for (let i = 0; i < 20; i++) {
      const localHostResponse = await client.get(`https://localhost:${router.address().port}/hello`);
      localHostResults[localHostResponse.data] = (localHostResults[localHostResponse.data] || 0) + 1;

      const loopbackResponse = await client.get(`https://127.0.0.1:${router.address().port}/hello`);
      loopbackResults[loopbackResponse.data] = (loopbackResults[loopbackResponse.data] || 0) + 1;
    }

    const localTotal = Object.values(localHostResults).reduce((a, b) => a + b, 0);
    const loopbackTotal = Object.values(loopbackResults).reduce((a, b) => a + b, 0);

    expect(localTotal).toBe(20);
    expect(loopbackTotal).toBe(20);

    if (protocols[0] === 'cranker_1.0') {
      expect(localHostResults['localhost']).toBeGreaterThan(5);
      expect(localHostResults['127.0.0.1']).toBeGreaterThan(5);
      expect(loopbackResults['localhost']).toBeGreaterThan(5);
      expect(loopbackResults['127.0.0.1']).toBeGreaterThan(5);
    } else {
      expect(localHostResults['localhost']).toBe(20);
      expect(localHostResults['127.0.0.1']).toBeUndefined();
      expect(loopbackResults['localhost']).toBeUndefined();
      expect(loopbackResults['127.0.0.1']).toBe(20);
    }
  });
});
