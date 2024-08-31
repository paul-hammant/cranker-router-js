// TimeoutTest.js

const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const axios = require('axios');
const fs = require('fs');
const IPValidator = require("../src/utils/IPValidator");

jest.setTimeout(30000); // Increase the timeout for these tests

describe('TimeoutTest', () => {
  let router, routerServer, connector, target;

  afterEach(async () => {
    if (connector) await connector.stop();
    if (target) await new Promise(resolve => target.close(resolve));
    if (routerServer) await new Promise(resolve => routerServer.close(resolve));
    if (router) await router.stop();
  });

  test.each([1, 2, 3])('if the idle timeout is exceeded before response started then a 504 is returned (repetition %i)', async (repetition) => {
    router = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withIdleTimeout(250, 'milliseconds')
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .build();

    routerServer = https.createServer({
      key: fs.readFileSync('test_resources/key.pem'),
      cert: fs.readFileSync('test_resources/cert.pem')
    }, (req, res) => {
      if (req.url.startsWith('/register')) {
        router.createRegistrationHandler()(req, res);
      } else {
        router.createHttpHandler()(req, res);
      }
    }).listen(0);

    target = http.createServer((req, res) => {
      if (req.url === '/my-app/sleep-without-response') {
        setTimeout(() => {
          res.writeHead(200);
          res.end('OK');
        }, 500);
      }
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(router, '*', target, preferredProtocols(repetition), 'my-app', routerServer);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    try {
      await client.get(`https://localhost:${routerServer.address().port}/my-app/sleep-without-response`);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error.response.status).toBe(504);
      expect(error.response.headers['content-type']).toBe('text/html;charset=utf-8');
      expect(error.response.data).toContain('<h1>504 Gateway Timeout</h1>');
      expect(error.response.data).toContain('<p>The <code>my-app</code> service did not respond in time.');
    }
  });

  test.each([1, 2, 3])('if the idle timeout is exceeded after response started then connection is closed (repetition %i)', async (repetition) => {
    router = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withIdleTimeout(1450, 'milliseconds')
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .build();

    routerServer = https.createServer({
      key: fs.readFileSync('test_resources/key.pem'),
      cert: fs.readFileSync('test_resources/cert.pem')
    }, (req, res) => {
      if (req.url.startsWith('/register')) {
        router.createRegistrationHandler()(req, res);
      } else {
        router.createHttpHandler()(req, res);
      }
    }).listen(0);

    target = http.createServer((req, res) => {
      if (req.url === '/my-app/send-chunk-then-sleep') {
        res.write('hi');
        setTimeout(() => {
          res.write('bye');
          res.end();
        }, 1700);
      }
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(router, '*', target, preferredProtocols(repetition), 'my-app', routerServer);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 2000
    });

    try {
      await client.get(`https://localhost:${routerServer.address().port}/my-app/send-chunk-then-sleep`);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).toContain('timeout');
    }
  });

  test.each([1, 2, 3])('if client disconnected before response start then proxy listeners should invoke (repetition %i)', async (repetition) => {
    let proxyInfo = null;
    const proxyListener = {
      onComplete: (info) => {
        proxyInfo = info;
      }
    };

    router = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withProxyListeners([proxyListener])
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .build();

    routerServer = https.createServer({
      key: fs.readFileSync('test_resources/key.pem'),
      cert: fs.readFileSync('test_resources/cert.pem')
    }, (req, res) => {
      if (req.url.startsWith('/register')) {
        router.createRegistrationHandler()(req, res);
      } else {
        router.createHttpHandler()(req, res);
      }
    }).listen(0);

    target = http.createServer((req, res) => {
      if (req.url === '/my-app/sleep-without-response') {
        setTimeout(() => {
          res.writeHead(200);
          res.end('OK');
        }, 500);
      }
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(router, '*', target, preferredProtocols(repetition), 'my-app', routerServer);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 400
    });

    try {
      await client.get(`https://localhost:${routerServer.address().port}/my-app/sleep-without-response`);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).toContain('timeout');
    }

    // Wait for the proxy listener to be called
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(proxyInfo).not.toBeNull();
    expect(proxyInfo.response.responseState).toBe('CLIENT_DISCONNECTED');
  });
});