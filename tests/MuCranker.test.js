// File: tests/MuCranker.test.js

const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');

describe('MuCrankerTest', () => {
  test('gettingVersionDoesNotThrowException', () => {
    const version = CrankerRouterBuilder.MuCranker.artifactVersion();
    expect(version).toContain('.');
  });
});