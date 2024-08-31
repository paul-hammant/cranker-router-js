const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const fs = require('fs');
const zlib = require('zlib');
const axios = require('axios');
const IPValidator = require('../src/utils/IPValidator');

describe('HttpTest', () => {
  let targetServer, crankerRouter, registrationServer, router, connector, connector2;

  beforeEach(async () => {
    targetServer = http.createServer((req, res) => {
      if (req.url === '/echo-headers') {
        res.setHeader('Server', 'mu');
        Object.entries(req.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        res.end();
      } else if (req.url.startsWith('/static/')) {
        // Serve static files
        const filePath = `./test_resources${req.url}`;
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not found');
          } else {
            res.writeHead(200);
            res.end(data);
          }
        });
      }
    }).listen(0);

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)            
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withSendLegacyForwardedHeaders(true)
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

    registrationServer = https.createServer({
      key: fs.readFileSync('test_resources/key.pem'),
      cert: fs.readFileSync('test_resources/cert.pem')
    }, crankerRouter.createRegistrationHandler()).listen(0);

    connector = await startConnectorAndWaitForRegistration(crankerRouter, '*', targetServer, preferredProtocols(1), '*', router);
  });

  afterEach(async () => {
    if (connector) await connector.stop();
    if (connector2) await connector2.stop();
    await new Promise(resolve => targetServer.close(resolve));
    await new Promise(resolve => registrationServer.close(resolve));
    await new Promise(resolve => router.close(resolve));
    await crankerRouter.stop();
  });

  test('can make GET requests with fixed size responses', async () => {
    const response = await axios.get(`https://localhost:${router.address().port}/static/large-txt-file.txt`, {
      headers: { 'accept-encoding': 'none' },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/plain;charset=utf-8');
    expect(response.headers['content-length']).toBeDefined();
    expect(response.headers['transfer-encoding']).toBeUndefined();
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  test('can make GET requests with chunked responses', async () => {
    const response = await axios.get(`https://localhost:${router.address().port}/static/large-txt-file.txt`, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/plain;charset=utf-8');
    expect(response.headers['content-length']).toBeUndefined();
    expect(response.headers['transfer-encoding']).toBe('chunked');
  });

  // Add more tests here...
});