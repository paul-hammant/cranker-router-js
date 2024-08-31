const { CrankerRouterBuilder } = require('../src/CrankerRouterBuilder');
const { startConnectorAndWaitForRegistration, preferredProtocols } = require('./testUtils');
const http = require('http');
const https = require('https');
const axios = require('axios');
const IPValidator = require("../src/utils/IPValidator");

describe('MultiConnectorTest', () => {
    let crankerRouter, router, targetV1_1, targetV1_2, targetV3_1, targetV3_2, connectorV1_1, connectorV1_2, connectorV3_1, connectorV3_2;

    afterEach(async () => {
        // Cleanup code
    });

    beforeEach(async () => {
        crankerRouter = new CrankerRouterBuilder(
            .withRegistrationIpValidator(IPValidator.AllowAll.allow)
            .withSupportedCrankerProtocols(['cranker_1.0', 'cranker_3.0'])
            .build();

        router = https.createServer({
            key: fs.readFileSync('test_resources/key.pem'),
            cert: fs.readFileSync('test_resources/cert.pem')
        }, (req, res) => {
            if (req.url.startsWith('/register')) {
                crankerRouter.createRegistrationHandler()(req, res);
            } else {
                crankerRouter.createHttpHandler()(req, res);
            }
        }).listen(0);
    });

    test('connectorCanDistributedToDifferentConnector_V1', async () => {
        // Implementation
    });

    test('connectorCanDistributedToDifferentConnector_V1_catchAllRouteTakeLowerPriority', async () => {
        // Implementation
    });

    // Add more tests from MultiConnectorTest.java
});