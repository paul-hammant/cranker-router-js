const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const fs = require('fs');
const axios = require('axios');
const IPValidator = require('../src/utils/IPValidator');

describe('HeaderProxying', () => {
  let targetServer, crankerRouter, router, connector;

  beforeEach(async () => {
    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
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

  afterEach(async () => {
    if (connector) await connector.stop();
    if (targetServer) await new Promise(resolve => targetServer.close(resolve));
    if (router) await new Promise(resolve => router.close(resolve));
    if (crankerRouter) await crankerRouter.stop();
  });

  test.each([1, 2, 3])('viaNameIsSetCorrectly (repetition %i)', async (repetition) => {
    targetServer = http.createServer((req, res) => {
      res.end(`via: ${req.headers['via']}`);
    }).listen(0);

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withViaName('some-host.name:1234')
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .build();

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    const response = await axios.get(`https://localhost:${router.address().port}`, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    expect(response.data).toBe('via: HTTP/1.1 some-host.name:1234');
  });

  test.each([1, 2, 3])('largeHeaderCanBeSentAndReceived (repetition %i)', async (repetition) => {
    const bigHeader = 'b'.repeat(18000);

    targetServer = http.createServer((req, res) => {
      res.setHeader('big-header', req.headers['big-header']);
      res.end('OK');
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    const response = await axios.get(`https://localhost:${router.address().port}/test`, {
      headers: { 'big-header': bigHeader },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    expect(response.status).toBe(200);
    expect(response.headers['big-header']).toBe(bigHeader);
  });

  test.each([1, 2, 3])('headerExceedMaxLimitWillBeReject (repetition %i)', async (repetition) => {
    const bigHeader = 'b'.repeat(58000);

    targetServer = http.createServer((req, res) => {
      res.end('OK');
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    await expect(axios.get(`https://localhost:${router.address().port}/test`, {
      headers: { 'big-header': bigHeader },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    })).rejects.toThrow('Request failed with status code 431');
  });

  test('viaNamesMustBeHttpHeaderTokensOrHostsOnly', () => {
    const invalidNames = ['a space', '"quoted"', 'whereu@'];
    for (const via of invalidNames) {
      expect(() => {
        new CrankerRouterBuilder()
          .withRegistrationIpValidator(IPValidator.AllowAll.allow)
          .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
          .withViaName(via);
      }).toThrow('Via names must be hostnames or HTTP header tokens');
    }
  });

  test.each([1, 2, 3])('multipleCookiesCanBeSentAndReceived (repetition %i)', async (repetition) => {
    targetServer = http.createServer((req, res) => {
      if (req.url === '/make') {
        res.setHeader('Set-Cookie', ['one=1; Secure', 'two=2; Secure']);
        res.end('done');
      } else if (req.url === '/check') {
        res.end(`${req.headers.cookie}; cookie-header-count: ${req.headers.cookie ? 1 : 0}`);
      }
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    const agent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true
    });

    // Set cookies
    await axios.get(`https://localhost:${router.address().port}/make`, { httpsAgent: agent });

    // Check cookies
    const checkResponse = await axios.get(`https://localhost:${router.address().port}/check`, { httpsAgent: agent });
    expect(checkResponse.data).toBe('one=1; two=2; cookie-header-count: 1');

    // Check multiple cookie headers
    const multipleHeaderResponse = await axios.get(`https://localhost:${router.address().port}/check`, {
      headers: {
        'Cookie': ['cookie3=3', 'cookie4=4']
      },
      httpsAgent: agent
    });
    expect(multipleHeaderResponse.data).toBe('cookie3=3; cookie4=4; cookie-header-count: 1');
  });

  test.each([1, 2, 3])('forwardedHeadersSentFromTheClientCanBeDiscarded (repetition %i)', async (repetition) => {
    targetServer = http.createServer((req, res) => {
      res.end(`${req.headers['x-forwarded-proto']} ${req.headers['x-forwarded-host']} ${req.headers['x-forwarded-for']} ${req.headers['forwarded'] ? '1' : '0'}`);
    }).listen(0);

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withDiscardClientForwardedHeaders(true)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .build();

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    const response = await axios.get(`https://localhost:${router.address().port}`, {
      headers: {
        'Forwarded': 'for=126.0.0.0;host=forwarded.example.org;proto=http',
        'X-Forwarded-Proto': 'http',
        'X-Forwarded-Host': 'example.org',
        'X-Forwarded-For': '123.0.0.0'
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    expect(response.data).toBe('undefined undefined undefined 1');
  });

  test.each([1, 2, 3])('hostIsProxiedByForwardHeader (repetition %i)', async (repetition) => {
    targetServer = http.createServer((req, res) => {
      const forwarded = req.headers['forwarded'];
      const host = forwarded.split(';').find(part => part.startsWith('host=')).split('=')[1];
      res.end(host);
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    const response = await axios.get(`https://localhost:${router.address().port}`, {
      headers: { 'Host': 'example.org' },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    expect(response.data).toBe('example.org');
  });

  test.each([1, 2, 3])('legacyForwardedHeadersAreNotSentByDefault (repetition %i)', async (repetition) => {
    targetServer = http.createServer((req, res) => {
      res.end(`${req.headers['x-forwarded-proto']} ${req.headers['x-forwarded-host']} ${req.headers['x-forwarded-for']} ${req.headers['forwarded'] ? '1' : '0'}`);
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    const response = await axios.get(`https://localhost:${router.address().port}`, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    expect(response.data).toBe('undefined undefined undefined 1');
  });

  test.each([1, 2, 3])('legacyForwardedHeadersCanBeSent (repetition %i)', async (repetition) => {
    targetServer = http.createServer((req, res) => {
      res.end(`${req.headers['x-forwarded-proto']} ${req.headers['x-forwarded-host']} ${req.headers['x-forwarded-for']} ${req.headers['forwarded'] ? '1' : '0'}`);
    }).listen(0);

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withSendLegacyForwardedHeaders(true)
      .build();

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(repetition), '*', router);

    const response = await axios.get(`https://localhost:${router.address().port}`, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const [proto, host, forValue, forwardedCount] = response.data.split(' ');
    expect(proto).toBe('https');
    expect(host).toBe(`localhost:${router.address().port}`);
    expect(forValue).toBe('127.0.0.1');
    expect(forwardedCount).toBe('1');
  });
});