const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');

/**
 * Starts a connector and returns a promise that resolves with the connector object.
 * @param {string} route - The route to register
 * @param {string} domain - The domain to register
 * @param {string[]} protocols - The protocols to use
 * @param {object} targetServer - The target server
 * @param {object} router - The router server
 * @param {string} [ip='127.0.0.1'] - The IP to connect to
 * @returns {Promise<object>} - A promise that resolves with the connector object
 */
function startConnector(route, domain, protocols, targetServer, router, ip = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://${ip}:${router.address().port}/register`, {
      rejectUnauthorized: false,
      protocols,
      headers: {
        'Route': route,
        'Domain': domain
      }
    });

    ws.on('open', () => {
      resolve({
        connectorId: () => 'mock-connector-id',
        stop: () => {
          return new Promise((resolveStop) => {
            ws.close();
            ws.on('close', resolveStop);
          });
        }
      });
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      reject(error);
    });
  });
}

/**
 * Waits for registration to complete.
 * @param {string} route - The route to check
 * @param {string} connectorId - The connector ID to check
 * @param {number} count - The number of routers to check
 * @param {object[]} routers - The routers to check
 * @returns {Promise<void>}
 */
async function waitForRegistration(route, connectorId, count, routers) {
  const maxAttempts = 10;
  const delay = 500;

  for (let i = 0; i < maxAttempts; i++) {
    const allRegistered = routers.every(router => {
      const info = router.collectInfo();
      const service = info.services.find(s => s.route === route);
      return service && service.connectors.some(c => c.connectorInstanceID === connectorId);
    });

    if (allRegistered) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw new Error(`Registration timed out after ${maxAttempts * delay}ms`);
}

/**
 * Returns the preferred protocols based on the repetition info.
 * @param {object} repetitionInfo - The repetition info object
 * @returns {string[]} - An array of preferred protocols
 */
function preferredProtocols(repetitionInfo) {
  return ['cranker_1.0', 'cranker_3.0'];
}

/**
 * Creates an HTTPS agent that doesn't reject unauthorized certificates.
 * @returns {https.Agent}
 */
function createHttpsAgent() {
  return new https.Agent({
    rejectUnauthorized: false,
  });
}

/**
 * Makes an HTTPS request to the router.
 * @param {object} router - The router server
 * @param {string} [path='/'] - The path to request
 * @param {string} [method='GET'] - The HTTP method to use
 * @returns {Promise<object>} - A promise that resolves with the response object
 */
async function makeRequest(router, path = '/', method = 'GET') {
  const agent = createHttpsAgent();
  const options = {
    hostname: 'localhost',
    port: router.address().port,
    path: path,
    method: method,
    agent: agent
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Starts a router and connector.
 * @param {object} crankerRouterBuilder - The CrankerRouterBuilder instance
 * @param {string[]} preferredProtocols - The preferred protocols
 * @returns {object} - An object containing the crankerRouter and router
 */
function startRouterAndConnector(crankerRouterBuilder, preferredProtocols) {
  const crankerRouter = crankerRouterBuilder.build();
  const router = https.createServer({
    key: fs.readFileSync('test_resources/key.pem'),
    cert: fs.readFileSync('test_resources/cert.pem')
  }, (req, res) => {
    if (req.url.startsWith('/register')) {
      crankerRouter.createRegistrationHandler()(req, res);
    } else {
      crankerRouter.createHttpHandler()(req, res);
    }
  }).listen(0);

  return { crankerRouter, router };
}

/**
 * Starts a connector and waits for registration.
 * @param {object} crankerRouter - The CrankerRouter instance
 * @param {string} domain - The domain to register
 * @param {object} target - The target server
 * @param {string[]} preferredProtocols - The preferred protocols
 * @param {string} route - The route to register
 * @param {object} registrationRouter - The registration router
 * @returns {Promise<object>} - A promise that resolves with the connector object
 */
async function startConnectorAndWaitForRegistration(crankerRouter, domain, target, preferredProtocols, route, registrationRouter) {
  const connector = await startConnector(route, domain, preferredProtocols, target, registrationRouter);
  await waitForRegistration(route, connector.connectorId(), 2, [crankerRouter]);
  return connector;
}

module.exports = {
  startRouterAndConnector,
  startConnectorAndWaitForRegistration,
  startConnector,
  waitForRegistration,
  preferredProtocols,
  createHttpsAgent,
  makeRequest
};