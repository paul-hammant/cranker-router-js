const {CrankerRouterBuilder} = require('../src/CrankerRouterBuilder');

describe('CrankerRouter', () => {
  test('should create a router with default settings', () => {
    const builder = new CrankerRouterBuilder();
    const router = builder.build();
    expect(router).toBeDefined();
  });

  // Add more tests here
});