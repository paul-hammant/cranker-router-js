class DarkModeManager {
  constructor() {
    this.darkModeHosts = new Set();
  }

  findHost(address) {
    return this.getAllDarkModeHosts().find(host => host === address) || null;
  }

  enableDarkModeFor(host) {
    this.darkModeHosts.add(host);
  }

  disableDarkModeFor(host) {
    this.darkModeHosts.delete(host);
  }

  isDarkModeEnabledFor(host) {
    return this.darkModeHosts.has(host);
  }

  getAllDarkModeHosts() {
    return Array.from(this.darkModeHosts);
  }

  // Additional methods to mirror Java functionality
  clearAllDarkModeHosts() {
    this.darkModeHosts.clear();
  }

  countDarkModeHosts() {
    return this.darkModeHosts.size;
  }
}

module.exports = DarkModeManager;
