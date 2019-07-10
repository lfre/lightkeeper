const merge = require('lodash.merge');

function extendFromSettings(baseSettings, namedSettings) {
  return function extender({ extend, ...routeSettings }) {
    if (extend === true) {
      return merge({}, baseSettings, routeSettings);
    }
    if (typeof extend === 'string') {
      // attempts to get the shared setting, fallback to global
      // TODO: Throw error instead of fallback
      const { extend: globalExtend, ...sharedSettings } = namedSettings[extend] || baseSettings;
      if (globalExtend === true) {
        return merge({}, baseSettings, sharedSettings, routeSettings);
      }
      return merge({}, sharedSettings, routeSettings);
    }

    return routeSettings;
  };
}

module.exports = extendFromSettings;
