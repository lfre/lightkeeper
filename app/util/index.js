const { join } = require('path');

const mergeSettings = function (base, override) {
  // budgets map, get keys, get obj from newbUDGETS, loop through keys, check in obj, do unionBy
}

const extendSettings = function (extend, baseSettings, newSettings = {}) {
  // if true, merge new into base
  // if a string, get namedSetting
  // if namedSetting is true, merge namedSetting, into base, then newSettings into it.
  // else use namedSettings
  // if settings is a string, extend a shared setting
}

/**
 * Replaces dynamic values in urls
 * @param {object} keyMap The key/value macros
 */
const replaceMacros = function (keyMap) {
  const regexKeys = Object.keys(keyMap);
  regexKeys.push('{commit_hash:(\d)}');

  return (url) => {
    const rgxp = new RegExp(regexKeys.join('|'), 'gi');
    return url.replace(rgxp, function (matched, capture) {
      if (capture) {
        // forms the regular string
        matched = `${matched.split(':').shift()}}`;
        const replace = keyMap[matched];
        return replace.substr(0, +capture);
      }
      return keyMap[matched];
    });
  }
}

const urlFormatter = (baseUrl, macros = {}) => {
  const macroReplacer = replaceMacros(macros);
  baseUrl = macroReplacer(baseUrl);
  return (url) => {
    if (!url || url === baseUrl) return baseUrl;

    if (url.startsWith('http')){
      return macroReplacer(url);
    }
    return macroReplacer(join(baseUrl, url));
  }
}

module.exports = { extendSettings, replaceMacros, urlFormatter }
