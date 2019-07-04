/* eslint-disable */
const { join } = require('path');

function mergeSettings(base, override) {
  // budgets map, get keys, get obj from newbUDGETS, loop through keys, check in obj, do unionBy
}

function extendFromSettings(namedSettings) {
  return function(extend, baseSettings, newSettings = {}) {
    // if true, merge new into base
    // if a string, get namedSetting
    // if namedSetting is true, merge namedSetting, into base, then newSettings into it.
    // else use namedSettings
    // if settings is a string, extend a shared setting
  };
}

/**
 * Replaces dynamic values in urls
 * @param {object} keyMap The key/value macros
 */
function replaceMacros(keyMap) {
  const regexKeys = Object.keys(keyMap);
  regexKeys.push('{commit_hash:(d)}');

  return url => {
    const rgxp = new RegExp(regexKeys.join('|'), 'gi');
    return url.replace(rgxp, function replacer(matched, capture) {
      if (capture) {
        // forms the regular string
        const match = `${matched.split(':').shift()}}`;
        const replace = keyMap[match];
        return replace.substr(0, +capture);
      }
      return keyMap[matched];
    });
  };
}

/**
 * Parses the global lighthouse options
 *
 * @param {object} config The lighthouse config
 */
function parseConfig(config = {}) {
  let lhUrl;
  let lhOptions = {};

  // If lighthouse options have been passed, override defaults
  if (typeof config === 'string') {
    lhUrl = config;
  } else if (typeof config === 'object') {
    ({ url: lhUrl, ...lhOptions } = config);
  }

  return { lhUrl, lhOptions };
}

function urlFormatter(baseUrl, macros = {}) {
  const macroReplacer = replaceMacros(macros);
  const base = macroReplacer(baseUrl);
  return url => {
    if (!url || url === base) return base;

    if (url.startsWith('http')) {
      return macroReplacer(url);
    }
    return macroReplacer(join(base, url));
  };
}

/**
 * Compares multiple names against the name provided in config
 * @param {array} namesToCheck The list of possible CI name
 */
function isValidCheck(namesToCheck = [], typeCheck = 'check') {
  return (type, ciName) => {
    const valid = namesToCheck.filter(checkName => {
      return checkName.toLowerCase() === ciName;
    });
    // Return if this a different type or check
    if (type !== typeCheck || !valid.length) {
      return false;
    }
    return true;
  };
}

module.exports = {
  extendFromSettings,
  isValidCheck,
  parseConfig,
  replaceMacros,
  urlFormatter
};
