const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const IPValidator = require('../src/utils/IPValidator');
const http = require('http');
jest.mock('http');

describe('CrankerRouter', () => {
  test('should create a router with default settings', () => {
    const builder = new CrankerRouterBuilder();
    const router = builder
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .build();
    expect(router).toBeDefined();
  });

  test('should create a router with custom settings', () => {
    const builder = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .withConnectorMaxWaitInMillis(1000)
      .withDiscardClientForwardedHeaders(true)
      .withViaName('custom-via');
    const router = builder.build();
    expect(router).toBeDefined();
    // Add more specific assertions about the router's configuration
  });

  test('should handle registration requests', async () => {
    const router = new CrankerRouterBuilder()
      .withRegistrationIpValidator(IPValidator.AllowAll.allow)
      .build();
    const handler = router.createRegistrationHandler();
    // Mock a request and response
    const req = { method: 'GET', url: '/register', socket: { remoteAddress: '127.0.0.1' }, headers: {} };
    const res = { writeHead: jest.fn(), end: jest.fn() };
    http.createServer.mockImplementation(() => ({
      on: jest.fn(),
      listen: jest.fn(),
      close: jest.fn((callback) => callback()),
    }));
    await handler(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(200);
  });

  test.each([1, 2, 3])('getRequestsWithChunksWork (repetition %i)', async (repetition) => {
    // Implementation
  });

  test.each([1, 2, 3])('fixedSizeResponsesWork (repetition %i)', async (repetition) => {
    // Implementation
  });

  test.each([1, 2, 3])('traceRequestsAreBlocked (repetition %i)', async (repetition) => {
    // Implementation
  });

  test.each([1, 2, 3])('postsWithBodiesWork (repetition %i)', async (repetition) => {
    // Implementation
  });

  test.each([1, 2, 3])('catchAllWorksWithAsterisk (repetition %i)', async (repetition) => {
    // Implementation
  });
  
});
