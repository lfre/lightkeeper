/* eslint-disable */
const merge = require('lodash.merge');

function extendBudgets(base, override) {}

function extendFromSettings(baseSettings, namedSettings) {
  return function({ extend, budgets, ...routeSettings }) {
    const settings = { ...{}, ...baseSettings };
    if (extend === true) {
      const mergedBudgets = extendBudgets(settings.budgets, budgets);
      return merge(settings, { ...routeSettings, budgets: mergedBudgets });
    }
    if (typeof extend === 'string') {
      // attempt to get named setting fallback to global
      // if named setting has extend true, extend globbal first
      //
    }

    return { ...routeSettings, budgets };
  };
}

module.exports = extendFromSettings;
