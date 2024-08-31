const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const axios = require('axios');
const fs = require('fs');
const IPValidator = require("../src/utils/IPValidator");

describe('ProxyListenerTest', () => {
  let crankerRouter, router, targetServer, connector;

  afterEach(async () => {
    if (connector) await connector.stop();
    if (targetServer) await new Promise(resolve => targetServer.close(resolve));
    if (router) await new Promise(resolve => router.close(resolve));
    if (crankerRouter) await crankerRouter.stop();
  });

  test.each([1, 2, 3])('completedRequestsGetNotifiedWithoutAnyError (repetition %i)', async (repetition) => {
    const received = [];

    targetServer = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('hello');
    }).listen(0);

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withProxyListeners([{
        onComplete: (proxyInfo) => {
          received.push(proxyInfo);
        }
      }])
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

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const response = await client.get(`https://localhost:${router.address().port}/?message=hello%20world`);
    expect(response.status).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 100)); // Give some time for the onComplete to be called

    expect(received).toHaveLength(1);
    const info = received[0];
    expect(info.route).toBe('*');
    expect(info.request.url).toBe('/?message=hello%20world');
    expect(info.response.statusCode).toBe(200);
    expect(info.durationMillis).toBeGreaterThan(-1);
    expect(info.bytesReceived).toBeGreaterThan(0);
    expect(info.bytesSent).toBeGreaterThan(0);
    expect(info.errorIfAny).toBeNull();
    expect(info.responseBodyFrames).toBeGreaterThan(0);
  });

  test('onFailureToAcquireProxySocketDueToNoConnectorA404IsReportedImmediately', async () => {
    const received = [];

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withConnectorMaxWaitInMillis(50)
      .withProxyListeners([{
        onFailureToAcquireProxySocket: (proxyInfo) => {
          received.push(proxyInfo);
        }
      }])
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

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    try {
      await client.get(`https://localhost:${router.address().port}/?message=hello%20world`);
    } catch (error) {
      expect(error.response.status).toBe(404);
    }

    await new Promise(resolve => setTimeout(resolve, 100)); // Give some time for the onFailureToAcquireProxySocket to be called

    expect(received).toHaveLength(1);
    const info = received[0];
    expect(info.socketWaitInMillis).toBe(0);
    expect(info.route).toBe('*');
    expect(info.request.url).toBe('/?message=hello%20world');
    expect(info.response.statusCode).toBe(404);
  });

  test.each([1, 2, 3])('headersToTargetCanBeChangedWithOnBeforeProxyToTarget (repetition %i)', async (repetition) => {
    targetServer = http.createServer((req, res) => {
      res.writeHead(200);
      res.end(`Headers at target: ${req.headers['to-remove']}; ${req.headers['to-retain']}; ${req.headers['added']}`);
    }).listen(0);

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withProxyListeners([{
        onBeforeProxyToTarget: (info, requestHeadersToTarget) => {
          delete requestHeadersToTarget['To-Remove'];
          requestHeadersToTarget['Added'] = 'added';
        }
      }])
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

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const response = await client.get(`https://localhost:${router.address().port}/`, {
      headers: {
        'to-remove': 'You shall not pass',
        'to-retain': 'This header will be proxied'
      }
    });

    expect(response.data).toBe('Headers at target: undefined; This header will be proxied; added');
  });

  // Add more tests here...
});