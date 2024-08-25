class ConnectorService {
    constructor(route, componentName, instances) {
        this.route = route;
        this.componentName = componentName;
        this.instances = instances;
    }

    getRoute() {
        return this.route;
    }

    getComponentName() {
        return this.componentName;
    }

    getConnectors() {
        return this.instances;
    }

    isCatchAll() {
        return this.route === '*';
    }

    toMap() {
        return {
            name: this.route,
            componentName: this.componentName,
            isCatchAll: this.isCatchAll(),
            connectors: this.instances.map(instance => instance.toMap())
        };
    }
}

module.exports = ConnectorService;
