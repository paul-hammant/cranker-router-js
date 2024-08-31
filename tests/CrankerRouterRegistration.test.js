const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const { LongestFirstRouteResolver } = require('../src/LongestFirstRouteResolver');
const http = require('http');
const https = require('https');
const axios = require('axios');
const fs = require('fs');

describe('CrankerRouterRegistrationTest', () => {
  let crankerRouter, router, target, connector;

  afterEach(async () => {
    if (connector) await connector.stop();
    if (target) await new Promise(resolve => target.close(resolve));
    if (router) await new Promise(resolve => router.close(resolve));
    if (crankerRouter) await crankerRouter.stop();
  });

  test.each([1, 2, 3])('canNotMapRouteWithStashWhenUsingDefaultRouteResolver (repetition %i)', async (repetition) => {
    crankerRouter = new CrankerRouterBuilder()
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

    target = http.createServer((req, res) => {
      if (req.url === '/my-service/api/instance') {
        res.writeHead(200);
        res.end('/my-service/instance');
      }
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', target, preferredProtocols(repetition), 'my-service/api', router);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      validateStatus: () => true
    });

    const response = await client.get(`https://localhost:${router.address().port}/my-service/api/instance`);
    expect(response.status).toBe(404);
  });

  test.each([1, 2, 3])('canMapRouteWithStashWhenUsingLongFirstRouteResolver (repetition %i)', async (repetition) => {
    crankerRouter = new CrankerRouterBuilder()
      .withRouteResolver(new LongestFirstRouteResolver())
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

    target = http.createServer((req, res) => {
      if (req.url === '/my-service/api/instance') {
        res.writeHead(200);
        res.end('/my-service/api/instance');
      }
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', target, preferredProtocols(repetition), 'my-service/api', router);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      validateStatus: () => true
    });

    const response = await client.get(`https://localhost:${router.address().port}/my-service/api/instance`);
    expect(response.status).toBe(200);
    expect(response.data).toBe('/my-service/api/instance');

    const notFoundResponse = await client.get(`https://localhost:${router.address().port}/my-service`);
    expect(notFoundResponse.status).toBe(404);
  });
});