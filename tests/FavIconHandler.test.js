const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { FavIconHandler } = require('../src/CrankerRouterBuilder');

describe('FavIconHandlerTest', () => {
  let server;

  afterEach((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  test('canUseFromClasspath', async () => {
    const faviconPath = path.join(__dirname, '..', 'test_resources', 'favicon.ico');
    const favIconHandler = await FavIconHandler.fromClassPath(faviconPath);

    server = http.createServer(async (req, res) => {
      if (req.url === '/favicon.ico' && req.method === 'GET') {
        await favIconHandler.handle(req, res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/favicon.ico`);
    expect(response.status).toBe(200);

    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBe(15406);
  });
});