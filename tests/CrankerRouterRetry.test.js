const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const axios = require('axios');
const fs = require('fs');
const IPValidator = require("../src/utils/IPValidator");

jest.setTimeout(30000); // Increase timeout for longer running tests

describe('CrankerRouterRetry', () => {
  let crankerRouter, router, target, connector;

  afterEach(async () => {
    if (connector) await connector.stop();
    if (target) await new Promise(resolve => target.close(resolve));
    if (router) await new Promise(resolve => router.close(resolve));
    if (crankerRouter && crankerRouter.stop) await crankerRouter.stop();
  });

  test.each([1, 2, 3])('will not call target service when client drops early (repetition %i)', async (repetition) => {
    const protocols = preferredProtocols(repetition);

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withConnectorMaxWaitInMillis(5000)
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

    let counter = 0;
    target = http.createServer((req, res) => {
      counter++;
      res.end('OK');
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', target, protocols, 'something', router);

    await connector.stop();

    const client = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        timeout: 200
      }),
      timeout: 200,
      validateStatus: () => true
    });

    for (let i = 0; i < 10; i++) {
      try {
        const response = await client.get(`https://localhost:${router.address().port}/something/blah`);
        if (protocols[0] === 'cranker_3.0') {
          expect(response.status).toBe(404);
        } else {
          fail('Expected request to timeout for cranker_1.0');
        }
      } catch (error) {
        if (protocols[0] === 'cranker_1.0') {
          expect(error.code).toBe('ECONNABORTED');
        } else {
          throw error;
        }
      }
    }

    expect(counter).toBe(0);

    // Restart connector
    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', target, protocols, 'something', router);

    // Now calls should succeed
    for (let i = 0; i < 10; i++) {
      const response = await client.get(`https://localhost:${router.address().port}/something/blah`);
      expect(response.status).toBe(200);
      expect(response.data).toBe('OK');
    }

    expect(counter).toBe(10);

    // Check that sliding window is back to 2
    await new Promise(resolve => setTimeout(resolve, 1000)); // Give some time for the sliding window to adjust
    const info = crankerRouter.collectInfo();
    const service = info.services.find(s => s.route === 'something');
    expect(service).toBeDefined();
    expect(service.connectors.length).toBe(1);
    expect(service.connectors[0].connections.length).toBe(2);
  });
});