class LongestFirstRouteResolver {
  /**
     * Constructor for LongestFirstRouteResolver
     */
  constructor() {
    // Currently, there's no state to initialize.
    // But having a constructor allows for future expansion if needed.
  }

  /**
     * Algorithm: using the longest route to match from the existing routes.
     *
     * @param {Set<string>} routes - The set of available routes.
     * @param {string} target - The target route to resolve.
     * @return {string} - The resolved route.
     */
  resolve(routes, target) {
    const routeSet = new Set(routes);
    if (routeSet.has(target)) {
      return target;
    }

    // Start with the full target path
    let builder = target;

    // Try matching from the longest path one by one
    let lastIndex;
    while ((lastIndex = builder.lastIndexOf('/')) >= 0) {
      builder = builder.substring(0, lastIndex);
      if (routeSet.has(builder)) {
        return builder;
      }
    }

    return '*';
  }
}

module.exports = LongestFirstRouteResolver;
