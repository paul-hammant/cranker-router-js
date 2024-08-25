class IPValidator {
  static AllowAll = (ip) => true;

  static OnlyLocalhost = (ip) => ip === '127.0.0.1' || ip === '::1';

  static create(validIps) {
    return (ip) => validIps.includes(ip);
  }
}

module.exports = IPValidator;
