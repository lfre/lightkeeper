const merge = require('lodash.merge');

function extendFromSettings(baseSettings, sharedSettings) {
  return function extender({ extend, ...routeSettings }) {
    if (extend === true) {
      return merge({}, baseSettings, routeSettings);
    }
    if (typeof extend === 'string') {
      // attempts to get the shared setting, fallback to global
      // TODO: Throw error instead of fallback
      const { extend: globalExtend, ...sharedSetting } = sharedSettings[extend] || baseSettings;
      if (globalExtend === true) {
        return merge({}, baseSettings, sharedSetting, routeSettings);
      }
      return merge({}, sharedSetting, routeSettings);
    }

    return routeSettings;
  };
}

module.exports = extendFromSettings;
