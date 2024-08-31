// IPValidator.js

class IPValidator {
    constructor(validationFunction) {
        this.allow = validationFunction;
    }

    static AllowAll = new IPValidator(() => true);

    static OnlyLocalhost = new IPValidator(ip => ip === '127.0.0.1' || ip === '::1');

    static create(validIps) {
        const ipSet = new Set(validIps);
        return new IPValidator(ip => ipSet.has(ip));
    }

    static createWithCIDR(cidrs) {
        // Note: This is a placeholder. You'll need to implement CIDR checking logic
        return new IPValidator(() => true);
    }

    static createWithRange(ranges) {
        // Note: This is a placeholder. You'll need to implement IP range checking logic
        return new IPValidator(() => true);
    }

    static createWithRegex(regex) {
        const re = new RegExp(regex);
        return new IPValidator(ip => re.test(ip));
    }

    static createComposite(...validators) {
        return new IPValidator(ip =>
            validators.some(validator => validator.allow(ip))
        );
    }
}

module.exports = IPValidator;