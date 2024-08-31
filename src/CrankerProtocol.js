class CrankerProtocolVersionNotSupportedException extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'CrankerProtocolVersionNotSupportedException';
  }
}

class CrankerProtocolVersionNotFoundException extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'CrankerProtocolVersionNotFoundException';
  }
}

const CrankerProtocol = {
  CRANKER_PROTOCOL_VERSION_1_0: '1.0',
  CRANKER_PROTOCOL_VERSION_2_0: '2.0',
  CRANKER_PROTOCOL_VERSION_3_0: '3.0',
  SUPPORTING_HTTP_VERSION_1_1: 'HTTP/1.1',
  REQUEST_HAS_NO_BODY_MARKER: '_2',
  REQUEST_BODY_PENDING_MARKER: '_1',
  REQUEST_BODY_ENDED_MARKER: '_3',
  CrankerProtocolVersionNotSupportedException,
  CrankerProtocolVersionNotFoundException,

  isVersionSupported(version) {
    return [this.CRANKER_PROTOCOL_VERSION_1_0, this.CRANKER_PROTOCOL_VERSION_2_0, this.CRANKER_PROTOCOL_VERSION_3_0].includes(version);
  },

  throwIfVersionNotSupported(version) {
    if (!this.isVersionSupported(version)) {
      throw new this.CrankerProtocolVersionNotSupportedException(`Cranker protocol version ${version} is not supported.`);
    }
  },

  throwIfVersionNotFound(version) {
    if (version == null) {
      throw new this.CrankerProtocolVersionNotFoundException('Cranker protocol version not found.');
    }
  }
};

module.exports = CrankerProtocol;