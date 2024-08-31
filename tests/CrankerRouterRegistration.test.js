// test/CrankerRouterRegistration.test.js

const { startRouterAndConnector, startConnectorAndWaitForRegistration } = require('./testUtils');
const http = require('http');
const axios = require('axios');
const { LongestFirstRouteResolver } = require('../src/LongestFirstRouteResolver');

describe('CrankerRouterRegistration', () => {
  let crankerRouter, router, target, connector;

  afterEach(() => {
    // Cleanup code
  });

  test.each([1, 2, 3])('canNotMapRouteWithStashWhenUsingDefaultRouteResolver (repetition %i)', async (repetition) => {
    // Implementation
  });

  test.each([1, 2, 3])('canMapRouteWithStashWhenUsingLongFirstRouteResolver (repetition %i)', async (repetition) => {
    // Implementation
  });
});