class DarkModeManager {
  constructor() {
    this.darkModeHosts = new Set();
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
}

module.exports = DarkModeManager;
