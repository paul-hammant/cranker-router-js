const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const axios = require('axios');
const fs = require('fs');

describe('MultiConnectorTest', () => {
  let crankerRouter, router, targetV1_1, targetV1_2, connectorV1_1, connectorV1_2;

  afterEach(async () => {
    if (connectorV1_1) await connectorV1_1.stop();
    if (connectorV1_2) await connectorV1_2.stop();
    if (targetV1_1) await new Promise(resolve => targetV1_1.close(resolve));
    if (targetV1_2) await new Promise(resolve => targetV1_2.close(resolve));
    if (router) await new Promise(resolve => router.close(resolve));
    if (crankerRouter) await crankerRouter.stop();
  });

  beforeEach(async () => {
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
  });

  test('connectorCanDistributedToDifferentConnector_V1', async () => {
    targetV1_1 = http.createServer((req, res) => {
      if (req.url === '/my-service/hello') {
        res.writeHead(200);
        res.end('targetV1_1');
      }
    }).listen(0);
    connectorV1_1 = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetV1_1, ['cranker_1.0'], 'my-service', router);

    targetV1_2 = http.createServer((req, res) => {
      if (req.url === '/my-service/hello') {
        res.writeHead(200);
        res.end('targetV1_2');
      }
    }).listen(0);
    connectorV1_2 = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetV1_2, ['cranker_1.0'], 'my-service', router);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const results = {};
    for (let i = 0; i < 20; i++) {
      const response = await client.get(`https://localhost:${router.address().port}/my-service/hello`);
      results[response.data] = (results[response.data] || 0) + 1;
    }

    expect(results['targetV1_1']).toBeGreaterThan(5);
    expect(results['targetV1_2']).toBeGreaterThan(5);
  });

  test('connectorCanDistributedToDifferentConnector_V1_catchAllRouteTakeLowerPriority', async () => {
    targetV1_1 = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('targetV1_1');
    }).listen(0);
    connectorV1_1 = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetV1_1, ['cranker_1.0'], '*', router);

    targetV1_2 = http.createServer((req, res) => {
      if (req.url === '/my-service/hello') {
        res.writeHead(200);
        res.end('targetV1_2');
      }
    }).listen(0);
    connectorV1_2 = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetV1_2, ['cranker_1.0'], 'my-service', router);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const results = {};
    for (let i = 0; i < 20; i++) {
      const response = await client.get(`https://localhost:${router.address().port}/my-service/hello`);
      results[response.data] = (results[response.data] || 0) + 1;
    }

    expect(results['targetV1_2']).toBe(20);

    const response = await client.get(`https://localhost:${router.address().port}/something`);
    expect(response.data).toBe('targetV1_1');
  });
});