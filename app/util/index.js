const { join } = require('path');

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

module.exports = { replaceMacros, urlFormatter }
