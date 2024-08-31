const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const EventSource = require('eventsource');
const fs = require('fs');
const IPValidator = require("../src/utils/IPValidator");

describe('ServerSentEventTest', () => {
  let crankerRouter, router, targetServer, connector, client;

  afterEach(async () => {
    if (client) {
      client.close();
    }
    if (connector) {
      await connector.stop();
    }
    if (targetServer) {
      await new Promise(resolve => targetServer.close(resolve));
    }
    if (router) {
      await new Promise(resolve => router.close(resolve));
    }
    if (crankerRouter) {
      await crankerRouter.stop();
    }
  });

  test.each([1, 2, 3])('MuServer_NormalSseTest (repetition %i)', async (repetition) => {
    targetServer = http.createServer((req, res) => {
      if (req.url === '/sse/counter') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        res.write('data: Number 0\n\n');
        res.write('data: Number 1\n\n');
        res.write('data: Number 2\n\n');
        res.end();
      }
    }).listen(0);

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withConnectorMaxWaitInMillis(400)
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

    const messages = [];
    return new Promise((resolve, reject) => {
      client = new EventSource(`https://localhost:${router.address().port}/sse/counter`, { rejectUnauthorized: false });

      client.onopen = () => messages.push('onOpen:');
      client.onerror = (err) => {
        messages.push(`onFailure: message=${err.message}`);
        reject(err);
      };
      client.onmessage = (event) => {
        messages.push(`onEvent: id=${event.lastEventId}, type=${event.type}, data=${event.data}`);
        if (event.data === 'Number 2') {
          client.close();
          messages.push('onClosed:');
          resolve();
        }
      };
    }).then(() => {
      expect(messages).toEqual([
        'onOpen:',
        'onEvent: id=, type=message, data=Number 0',
        'onEvent: id=, type=message, data=Number 1',
        'onEvent: id=, type=message, data=Number 2',
        'onClosed:'
      ]);
    });
  });

  test('MuServer_TargetServerDownInMiddleTest_ClientTalkToTargetServer', async () => {
    targetServer = http.createServer((req, res) => {
      if (req.url === '/sse/counter') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        res.write('data: Number 0\n\n');
        res.write('data: Number 1\n\n');
        res.write('data: Number 2\n\n');
        targetServer.close();
      }
    }).listen(0);

    const messages = [];
    return new Promise((resolve) => {
      client = new EventSource(`http://localhost:${targetServer.address().port}/sse/counter`);

      client.onopen = () => messages.push('onOpen:');
      client.onerror = (err) => {
        messages.push(`onFailure: message=${err.message}`);
        resolve();
      };
      client.onmessage = (event) => {
        messages.push(`onEvent: id=${event.lastEventId}, type=${event.type}, data=${event.data}`);
      };
    }).then(() => {
      expect(messages).toEqual([
        'onOpen:',
        'onEvent: id=, type=message, data=Number 0',
        'onEvent: id=, type=message, data=Number 1',
        'onEvent: id=, type=message, data=Number 2',
        'onFailure: message=null'
      ]);
    });
  });

  test.each([1, 2, 3])('MuServer_TargetServerDownInMiddleTest_ClientTalkToRouter (repetition %i)', async (repetition) => {
    targetServer = http.createServer((req, res) => {
      if (req.url === '/sse/counter') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        res.write('data: Number 0\n\n');
        res.write('data: Number 1\n\n');
        res.write('data: Number 2\n\n');
        setTimeout(() => targetServer.close(), 100);
      }
    }).listen(0);

    crankerRouter = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
      .withConnectorMaxWaitInMillis(400)
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

    const messages = [];
    return new Promise((resolve) => {
      client = new EventSource(`https://localhost:${router.address().port}/sse/counter`, { rejectUnauthorized: false });

      client.onopen = () => messages.push('onOpen:');
      client.onerror = (err) => {
        messages.push(`onFailure: message=${err.message}`);
        resolve();
      };
      client.onmessage = (event) => {
        messages.push(`onEvent: id=${event.lastEventId}, type=${event.type}, data=${event.data}`);
      };
    }).then(() => {
      expect(messages).toEqual([
        'onOpen:',
        'onEvent: id=, type=message, data=Number 0',
        'onEvent: id=, type=message, data=Number 1',
        'onEvent: id=, type=message, data=Number 2',
        'onFailure: message=null'
      ]);
    });
  });
});