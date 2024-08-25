const WebSocket = require('ws');

function startConnector(route, domain, protocols, targetServer, router) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://localhost:${router.address().port}/register`, {
      rejectUnauthorized: false,
      protocols
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

async function waitForRegistration(route, connectorId, count, routers) {
  // In a real implementation, you'd wait for the registration to complete
  await new Promise(resolve => setTimeout(resolve, 500));
}

function preferredProtocols(repetitionInfo) {
  return ['cranker_1.0', 'cranker_3.0'];
}

module.exports = {
  startConnector,
  waitForRegistration,
  preferredProtocols
};
