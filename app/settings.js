const merge = require('lodash.merge');

function extendFromSettings(baseSettings, sharedSettings) {
  return function extender({ extends: ext, ...routeSettings }) {
    if (ext === true) {
      return merge({}, baseSettings, routeSettings);
    }
    if (typeof ext === 'string') {
      // attempts to get the shared setting, fallback to global
      // TODO: Throw error instead of fallback
      const { extends: globalExtend, ...sharedSetting } = sharedSettings[ext] || baseSettings;
      if (globalExtend === true) {
        return merge({}, baseSettings, sharedSetting, routeSettings);
      }
      return merge({}, sharedSetting, routeSettings);
    }

    return routeSettings;
  };
}

module.exports = extendFromSettings;
