// File: tests/DarkHostImpl.test.js

const { DarkHost } = require('../src/CrankerRouterBuilder');
const dns = require('dns').promises;

describe('DarkHostImpl', () => {
  test('ipOrHostOrDomainAreTheSame', async () => {
    const now = new Date();
    const domain = await DarkHost.create('localhost', now, null);
    const ip = await DarkHost.create('127.0.0.1', now, null);

    expect(await domain.sameHost(ip.address())).toBe(true);
  });

  test('darkHostsCanBeConvertedToMaps', async () => {
    const now = new Date();
    const noReason = await DarkHost.create('127.0.0.1', now, null);
    const noReasonMap = noReason.toMap();

    expect(noReasonMap.address).toBe('127.0.0.1');
    expect(noReasonMap.dateEnabled).toEqual(now);
    expect(noReasonMap.reason).toBeNull();
    expect(Object.keys(noReasonMap).length).toBe(3);

    const hasReason = await DarkHost.create('127.0.0.1', now, 'Got a reason');
    const hasReasonMap = hasReason.toMap();

    expect(hasReasonMap.address).toBe('127.0.0.1');
    expect(hasReasonMap.dateEnabled).toEqual(now);
    expect(hasReasonMap.reason).toBe('Got a reason');
    expect(Object.keys(hasReasonMap).length).toBe(3);
  });

  test('ipv6Addresses', async () => {
    const now = new Date();
    const ipv6 = await DarkHost.create('::1', now, null);
    const ipv4 = await DarkHost.create('127.0.0.1', now, null);
    expect(await ipv6.sameHost(ipv4.address())).toBe(true);
  });

  test('darkHostsCanBeConvertedToMaps', async () => {
    const now = new Date();
    const noReason = await DarkHost.create('127.0.0.1', now, null);
    const noReasonMap = noReason.toMap();

    expect(noReasonMap.address).toBe('127.0.0.1');
    expect(noReasonMap.dateEnabled).toEqual(now);
    expect(noReasonMap.reason).toBeNull();
    expect(Object.keys(noReasonMap).length).toBe(3);

    const hasReason = await DarkHost.create('127.0.0.1', now, 'Got a reason');
    const hasReasonMap = hasReason.toMap();

    expect(hasReasonMap.address).toBe('127.0.0.1');
    expect(hasReasonMap.dateEnabled).toEqual(now);
    expect(hasReasonMap.reason).toBe('Got a reason');
    expect(Object.keys(hasReasonMap).length).toBe(3);
  });

});
