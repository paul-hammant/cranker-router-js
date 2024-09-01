const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const IPValidator = require("../src/utils/IPValidator");

describe('DarkMode', () => {
  let targetServer, cranker, darkModeManager, crankerServer, connector;

  beforeEach(async () => {
    targetServer = http.createServer((req, res) => {
      if (req.url === '/static/hello.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Hello, World!</body></html>');
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    }).listen(0);

    cranker = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withConnectorMaxWaitInMillis(2000)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .build();

    darkModeManager = new DarkModeManager();

    crankerServer = https.createServer({
      key: fs.readFileSync(path.join(__dirname, '..', 'test_resources', 'key.pem')),
      cert: fs.readFileSync(path.join(__dirname, '..', 'test_resources', 'cert.pem'))
    }, (req, res) => {
      if (req.url.startsWith('/register')) {
        cranker.createRegistrationHandler()(req, res);
      } else {
        cranker.createHttpHandler()(req, res);
      }
    }).listen(0);

    connector = await startConnectorAndWaitForRegistration(cranker, '*', targetServer, preferredProtocols(1), '*', crankerServer);
  });

  afterEach(async () => {
    if (connector) await connector.stop();
    if (targetServer) await new Promise(resolve => targetServer.close(resolve));
    if (crankerServer) await new Promise(resolve => crankerServer.close(resolve));
    if (cranker) await cranker.stop();
    for (const darkHost of darkModeManager.darkHosts()) {
      await darkModeManager.disableDarkMode(darkHost);
    }
  });

  test('darkModeStopsRequestsGoingToATargetServer', async () => {
    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      validateStatus: () => true
    });

    await darkModeManager.enableDarkMode({ address: () => '127.0.0.2' });

    let response = await client.get(`https://localhost:${crankerServer.address().port}/static/hello.html`);
    expect(response.status).toBe(200);
    expect(response.data).toBe('<html><body>Hello, World!</body></html>');

    await darkModeManager.enableDarkMode({ address: () => '127.0.0.1' });

    response = await client.get(`https://localhost:${crankerServer.address().port}/static/hello.html`);
    expect(response.status).toBe(503);
    expect(response.data).toContain('503 Service Unavailable');

    await darkModeManager.disableDarkMode({ address: () => '127.0.0.1' });

    response = await client.get(`https://localhost:${crankerServer.address().port}/static/hello.html`);
    expect(response.status).toBe(200);
    expect(response.data).toBe('<html><body>Hello, World!</body></html>');
  });

  test('findByIPWorks', async () => {
    const ip_127_0_0_2 = { address: '127.0.0.2' };
    expect(await darkModeManager.findHost(ip_127_0_0_2)).toBeNull();

    await darkModeManager.enableDarkMode({ address: () => '127.0.0.1' });
    await darkModeManager.enableDarkMode({ address: () => '127.0.0.2' });
    await darkModeManager.enableDarkMode({ address: () => '127.0.0.3' });

    const found = await darkModeManager.findHost(ip_127_0_0_2);
    expect(found).not.toBeNull();
    expect(found.address()).toBe('127.0.0.2');

    await darkModeManager.disableDarkMode({ address: () => '127.0.0.2' });
    expect(await darkModeManager.findHost(ip_127_0_0_2)).toBeNull();
  });

  test('theDarkHostsAreAvailableToQuery', async () => {
    expect(darkModeManager.darkHosts()).toHaveLength(0);

    const host = { address: () => '127.0.0.2' };
    await darkModeManager.enableDarkMode(host);
    expect(darkModeManager.darkHosts()).toHaveLength(1);
    expect(darkModeManager.darkHosts()[0].address()).toBe('127.0.0.2');

    await darkModeManager.enableDarkMode(host);
    await darkModeManager.enableDarkMode({
      address: () => '127.0.0.2',
      dateEnabled: new Date('2019-11-19T03:04:06.329Z'),
      reason: 'ignored'
    });

    expect(darkModeManager.darkHosts()).toHaveLength(1);

    const localhost = { address: () => '127.0.0.1' };
    await darkModeManager.enableDarkMode(localhost);

    expect(darkModeManager.darkHosts()).toHaveLength(2);
    expect(darkModeManager.darkHosts().map(h => h.address())).toEqual(expect.arrayContaining(['127.0.0.1', '127.0.0.2']));

    await darkModeManager.disableDarkMode({
      address: () => '127.0.0.2',
      dateEnabled: new Date('2019-11-19T04:04:06.329Z'),
      reason: 'Umm, some reason'
    });

    expect(darkModeManager.darkHosts()).toHaveLength(1);
    expect(darkModeManager.darkHosts()[0].address()).toBe('127.0.0.1');

    await darkModeManager.disableDarkMode(host);
    expect(darkModeManager.darkHosts()).toHaveLength(1);
    expect(darkModeManager.darkHosts()[0].address()).toBe('127.0.0.1');
  });
});
