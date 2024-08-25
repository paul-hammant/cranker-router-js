class CrankerProtocolVersionNotSupportedException extends Error {
    constructor(reason) {
        super(reason);
        this.name = "CrankerProtocolVersionNotSupportedException";
    }
}

class CrankerProtocolVersionNotFoundException extends Error {
    constructor(reason) {
        super(reason);
        this.name = "CrankerProtocolVersionNotFoundException";
    }
}

const CrankerProtocol = {
    CRANKER_PROTOCOL_VERSION_1_0: "1.0",
    CRANKER_PROTOCOL_VERSION_2_0: "2.0",
    CRANKER_PROTOCOL_VERSION_3_0: "3.0",
    SUPPORTING_HTTP_VERSION_1_1: "HTTP/1.1",
    CrankerProtocolVersionNotSupportedException,
    CrankerProtocolVersionNotFoundException
};

module.exports = CrankerProtocol;
