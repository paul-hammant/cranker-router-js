/**
 * Information about a service that is connected to this router.
 * A "service" is 1 or more connector instances that register the same route.
 */
class ConnectorService {
  /**
     * @param {string} route - The path prefix of the service.
     * @param {string} componentName - The component name that the connector registered.
     * @param {ConnectorInstance[]} instances - The connectors that serve this route.
     */
  constructor(route, componentName, instances) {
    this._route = route;
    this._componentName = componentName;
    this._instances = Object.freeze([...instances]); // Create a frozen copy to ensure immutability
  }

  /**
     * The path prefix of the service.
     * @returns {string} The path prefix of the service, or "*" if it is a catch-all service.
     */
  get route() {
    return this._route;
  }

  /**
     * The component name that the connector registered.
     * @returns {string} The component name.
     */
  get componentName() {
    return this._componentName;
  }

  /**
     * The connectors that serve this route.
     * @returns {ConnectorInstance[]} The connectors that serve this route.
     */
  get connectors() {
    return this._instances;
  }

  /**
     * Checks if this connector serves from the root of the URL path.
     * @returns {boolean} True if this connector serves from the root of the URL path.
     */
  isCatchAll() {
    return this._route === '*';
  }

  /**
     * Gets this data as key-value pairs.
     * @returns {Object} This data as key-value pairs.
     */
  toMap() {
    return {
      name: this._route,
      componentName: this._componentName,
      isCatchAll: this.isCatchAll(),
      connectors: this._instances.map(instance => instance.toMap())
    };
  }
}

module.exports = ConnectorService;