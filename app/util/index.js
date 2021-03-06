/* eslint-disable */
const { resolve } = require('url');

/**
 *
 * @param {string} summary The dropdown summary
 * @param {string} content The content of the dropdown
 * @param {object} settings Optional settings
 */
function detailsSummary(
  summary,
  content,
  { reportUrl, includeLineBreak = true, detailTag = '<details>' } = {}
) {
  const report = reportUrl ? `\n${reportUrl}\n` : '';
  const linebreak = includeLineBreak === true ? `\n---\n` : '';
  return `${detailTag}
<summary>${summary}</summary>
<br>

${content}
${report}
</details>
${linebreak}
`;
}

/**
 * Finds the pull request number from a commit hash
 * @param {object} context The github event contextt
 * @param {string} headSha The commit hash in the PR
 */
async function getPullRequestNumber(context, headSha) {
  const {
    data: pullRequests = []
  } = await context.github.repos.listPullRequestsAssociatedWithCommit(
    context.repo({
      commit_sha: headSha,
      per_page: 100
    })
  );

  let pullNumber = null;

  pullRequests.some(({ state, number }) => {
    if (state === 'closed') return false;
    pullNumber = number;
    return true;
  });

  return pullNumber;
}

/**
 * Compares multiple names against the name provided in config
 * @param {array} namesToCheck The list of possible CI name
 * @param {string} typeCheck The string to check against
 * @param {function} checkFunction An optional function to override the equal check
 */
function isValidCheck(namesToCheck = [], typeCheck = '', checkFunction) {
  const checker = typeof checkFunction === 'function' ? checkFunction : false;
  return (type, ciNames) => {
    const valid = namesToCheck.filter(checkName => {
      const nameToCheck = checkName.toLowerCase();
      return checker ? checker(nameToCheck, ciNames) : ciNames.includes(nameToCheck);
    });
    // Return if this a different type or check
    if (type !== typeCheck || !valid.length) {
      return false;
    }
    return true;
  };
}

/**
 * Replaces dynamic values in urls
 * @param {object} keyMap The key/value macros
 */
function replaceMacros(keyMap) {
  const regexKeys = Object.keys(keyMap);
  regexKeys.push('{commit_hash:(\\d)}');

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
  const { href: base, pathname: basePath = '' } = new URL(macroReplacer(baseUrl));
  return url => {
    if (!url || url === base) return base;

    if (url.startsWith('http')) {
      return new URL(macroReplacer(url)).href;
    }
    return macroReplacer(resolve(base, resolve(basePath, url.replace(/^\/+/, ''))));
  };
}

module.exports = {
  detailsSummary,
  getPullRequestNumber,
  isValidCheck,
  parseConfig,
  replaceMacros,
  urlFormatter
};
