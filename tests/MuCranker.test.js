const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');

describe('MuCrankerTest', () => {
  test('gettingVersionDoesNotThrowException', () => {
    const version = CrankerRouterBuilder.MuCranker.artifactVersion();
    expect(version).toContain('.');
    expect(version.split('.').length).toBeGreaterThanOrEqual(2);
  });

  test('versionIsNotDefault', () => {
    const version = CrankerRouterBuilder.MuCranker.artifactVersion();
    expect(version).not.toBe('0.x');
  });

  test('versionMatchesPackageJson', () => {
    const packageJson = require('../package.json');
    const version = CrankerRouterBuilder.MuCranker.artifactVersion();
    expect(version).toBe(packageJson.version);
  });
});