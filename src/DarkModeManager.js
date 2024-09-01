const { promisify } = require('util');
const dns = require('dns');
const dnsLookup = promisify(dns.lookup);

class DarkModeManager {
  constructor() {
    this.darkModeHosts = new Set();
  }

  darkHosts() {
    return this.getAllDarkModeHosts();
  }

  async findHost(address) {
    for (const host of this.darkModeHosts) {
      if (await this.sameHost(host, address)) {
        return host;
      }
    }
    return null;
  }

  async enableDarkMode(darkHost) {
    if (typeof darkHost === 'string') {
      this.darkModeHosts.add(darkHost);
    } else if (darkHost && typeof darkHost.address === 'function') {
      this.darkModeHosts.add(await this.resolveAddress(darkHost.address()));
    } else {
      throw new Error('Invalid darkHost parameter');
    }
  }

  async disableDarkMode(darkHost) {
    if (typeof darkHost === 'string') {
      this.darkModeHosts.delete(darkHost);
    } else if (darkHost && typeof darkHost.address === 'function') {
      const resolvedAddress = await this.resolveAddress(darkHost.address());
      this.darkModeHosts.delete(resolvedAddress);
    } else {
      throw new Error('Invalid darkHost parameter');
    }
  }

  async isDarkModeEnabledFor(host) {
    const resolvedHost = await this.resolveAddress(host);
    return this.darkModeHosts.has(resolvedHost);
  }

  getAllDarkModeHosts() {
    return Array.from(this.darkModeHosts);
  }

  clearAllDarkModeHosts() {
    this.darkModeHosts.clear();
  }

  countDarkModeHosts() {
    return this.darkModeHosts.size;
  }

  async resolveAddress(address) {
    if (this.isIpAddress(address)) {
      return address;
    }
    try {
      const result = await dnsLookup(address);
      return result.address;
    } catch (error) {
      console.error(`Failed to resolve hostname: ${address}`, error);
      return address; // Return original address if resolution fails
    }
  }

  isIpAddress(address) {
    return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(address) || // IPv4
        /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(address); // IPv6
  }

  async sameHost(host1, host2) {
    const resolvedHost1 = await this.resolveAddress(host1);
    const resolvedHost2 = await this.resolveAddress(host2);

    return resolvedHost1 === resolvedHost2 ||
        (resolvedHost1 === '127.0.0.1' && resolvedHost2 === '::1') ||
        (resolvedHost1 === '::1' && resolvedHost2 === '127.0.0.1');
  }
}

module.exports = DarkModeManager;
