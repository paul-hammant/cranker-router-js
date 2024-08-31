const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const axios = require('axios');
const fs = require('fs');
const IPValidator = require("../src/utils/IPValidator");

describe('RouterInfoTest', () => {
  let router, routerServer, connector, connector2, target;

  afterEach(async () => {
    if (connector) await connector.stop();
    if (connector2) await connector2.stop();
    if (target) await new Promise(resolve => target.close(resolve));
    if (routerServer) await new Promise(resolve => routerServer.close(resolve));
    if (router) await router.stop();
  });

  test.each([1, 2, 3])('connectorInfoIsAvailableViaCollectInfo (repetition %i)', async (repetition) => {
    router = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
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
      res.writeHead(200);
      res.end(`Got ${req.method} ${req.url} and query ${new URL(req.url, `http://${req.headers.host}`).searchParams.get('this thing')}`);
    }).listen(0);

    expect(router.collectInfo().services).toHaveLength(0);

    connector = await startConnectorAndWaitForRegistration(router, '*', target, preferredProtocols(repetition), 'my-target-server', routerServer);
    connector2 = await startConnectorAndWaitForRegistration(router, '*', target, preferredProtocols(repetition), 'another-target-server', routerServer);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const resp1 = await client.get(`https://localhost:${routerServer.address().port}/my-target-server/blah%20blah?this%20thing=some%20value`);
    expect(resp1.status).toBe(200);
    expect(resp1.data).toBe('Got GET /my-target-server/blah%20blah and query some value');

    const resp2 = await client.get(`https://localhost:${routerServer.address().port}/another-target-server/blah%20blah?this%20thing=some%20value`);
    expect(resp2.status).toBe(200);
    expect(resp2.data).toBe('Got GET /another-target-server/blah%20blah and query some value');

    const info = router.collectInfo();
    expect(info.services).toHaveLength(2);
    const connectorService = info.services[0];
    expect(['my-target-server', 'another-target-server']).toContain(connectorService.route);
    expect(connectorService.connectors).toHaveLength(1);
    const ci = connectorService.connectors[0];
    expect(ci.ip).toBe('127.0.0.1');
    expect(ci.connections.length).toBeGreaterThanOrEqual(1);
    expect(ci.connections.length).toBeLessThanOrEqual(2);
  });

  test.each([1, 2, 3])('infoIsExposedAsAMapForSimpleHealthReporting (repetition %i)', async (repetition) => {
    router = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .build();

    routerServer = https.createServer({
      key: fs.readFileSync('test_resources/key.pem'),
      cert: fs.readFileSync('test_resources/cert.pem')
    }, (req, res) => {
      if (req.url === '/health') {
        const health = {
          isAvailable: true,
          mucrankerVersion: router.constructor.muCrankerVersion(),
          services: router.collectInfo().toMap()
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
      } else if (req.url.startsWith('/register')) {
        router.createRegistrationHandler()(req, res);
      } else {
        router.createHttpHandler()(req, res);
      }
    }).listen(0);

    target = http.createServer((req, res) => {
      res.writeHead(200);
      res.end(`Got ${req.method} ${req.url} and query ${new URL(req.url, `http://${req.headers.host}`).searchParams.get('this thing')}`);
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(router, '*', target, preferredProtocols(repetition), 'my-target-server', routerServer);
    connector2 = await startConnectorAndWaitForRegistration(router, '*', target, preferredProtocols(repetition), 'another-target-server', routerServer);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    await client.get(`https://localhost:${routerServer.address().port}/my-target-server/`);

    const resp = await client.get(`https://localhost:${routerServer.address().port}/health`);
    const health = resp.data;

    expect(health.isAvailable).toBe(true);
    expect(health.mucrankerVersion).toBeDefined();
    expect(health.services['my-target-server']).toBeDefined();
    expect(health.services['another-target-server']).toBeDefined();

    const mts = health.services['my-target-server'];
    expect(mts.name).toBe('my-target-server');
    expect(mts.componentName).toBe('junit');
    expect(mts.isCatchAll).toBe(false);
    expect(mts.connectors).toHaveLength(1);

    const connector = mts.connectors[0];
    expect(connector.connectorInstanceID).toBeDefined();
    expect(connector.darkMode).toBe(false);
    expect(connector.ip).toBe('127.0.0.1');
    expect(connector.connections).toHaveLength(1);

    const connection = connector.connections[0];
    expect(connection.port).toBeDefined();
    expect(connection.socketID).toBeDefined();
  });

  test('infoIsExposedAsAMapForSimpleHealthReportingForBothV1AndV3', async () => {
    router = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .build();

    routerServer = https.createServer({
      key: fs.readFileSync('test_resources/key.pem'),
      cert: fs.readFileSync('test_resources/cert.pem')
    }, (req, res) => {
      if (req.url === '/health') {
        const health = {
          isAvailable: true,
          mucrankerVersion: router.constructor.muCrankerVersion(),
          services: router.collectInfo().toMap()
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
      } else if (req.url.startsWith('/register')) {
        router.createRegistrationHandler()(req, res);
      } else {
        router.createHttpHandler()(req, res);
      }
    }).listen(0);

    target = http.createServer((req, res) => {
      res.writeHead(200);
      res.end(`Got ${req.method} ${req.url} and query ${new URL(req.url, `http://${req.headers.host}`).searchParams.get('this thing')}`);
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(router, '*', target, ['cranker_1.0'], 'my-target-server', routerServer);
    connector2 = await startConnectorAndWaitForRegistration(router, '*', target, ['cranker_3.0'], 'my-target-server', routerServer);

    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    await client.get(`https://localhost:${routerServer.address().port}/my-target-server/`);

    const resp = await client.get(`https://localhost:${routerServer.address().port}/health`);
    const health = resp.data;

    expect(health.services['my-target-server']).toBeDefined();

    const mts = health.services['my-target-server'];
    expect(mts.name).toBe('my-target-server');
    expect(mts.componentName).toBe('junit');
    expect(mts.isCatchAll).toBe(false);
    expect(mts.connectors).toHaveLength(2);

    const protocols = mts.connectors.map(c => c.connections[0].protocol).sort();
    expect(protocols).toEqual(['cranker_1.0', 'cranker_3.0']);

    for (const connector of mts.connectors) {
      expect(connector.connectorInstanceID).toBeDefined();
      expect(connector.darkMode).toBe(false);
      expect(connector.ip).toBe('127.0.0.1');
      expect(connector.connections).toHaveLength(1);

      const connection = connector.connections[0];
      expect(connection.port).toBeDefined();
      expect(connection.socketID).toBeDefined();
      expect(['cranker_1.0', 'cranker_3.0']).toContain(connection.protocol);
    }
  });
});