// This is a fix for Node v.8
// Remove when v.10 is supported in Lambdas
// https://github.com/GoogleChrome/lighthouse/issues/8909
global.URL = require('url').URL;

const {
  createHmac,
  pseudoRandomBytes,
  timingSafeEqual
} = require('crypto');
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const lighthouse = require('lighthouse');
const { parse } = require('url');
const { promisify } = require("util");
const { gzip } = require("zlib");
const { json, send } = require('micro');
const defaultConfig = require('./default.json');

const {
  WEBHOOK_SECRET: secret,
  EXEC_PATH: execPath
} = process.env;
const compress = promisify(gzip);

let args;
let executablePath;

if (process.platform === 'darwin') {
  args = chrome.args.filter(a => a !== '--single-process');
  executablePath = Promise.resolve(execPath);
} else {
  args = chrome.args;
  executablePath = chrome.executablePath;
}

/**
 * Runs a Lighthouse test
 * @param {string} url The url to run
 * @param {object} options The lighthouse options
 * @param {object} config The lighthouse config
 * @param {object} pupConfig The puppeteer config
 */
const lh = async function (url, options = {}, config = {}, pupConfig = {}) {
  let browser;

  try {
    browser = await puppeteer.launch({ ...pupConfig,
      args,
      executablePath: await executablePath
    });
    const { port } = parse(browser.wsEndpoint());
    return await lighthouse(url, { ...options,
      port,
      output: "json",
      logLevel: "error"
    }, config);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Please don't hack this 😊
 * @param {string} a Header
 * @param {string} b Value to compare
 */
const timeSafeCompare = function (a, b) {
  const sa = String(a);
  const sb = String(b);
  const key = pseudoRandomBytes(32);
  const ah = createHmac('sha256', key).update(sa).digest();
  const bh = createHmac('sha256', key).update(sb).digest();

  return timingSafeEqual(ah, bh) && a === b;
}

module.exports = async (req, res) => {
  let result;
  let error;

  if (!timeSafeCompare(req.headers.authorization, secret)) {
    send(res, 403, {
      error: 'Sorry! This only accepts requests from Lightkeeper'
    });
    return;
  }
  const {
    url,
    options = {},
    config = {},
    puppeteerConfig = {}
  } = await json(req);

  if (!url || !url.startsWith('http')) {
    send(res, 400, {
      error: 'The URL must start with http'
    });
    return;
  }

  try {
    result = await lh(
      url, options, { ...defaultConfig, config }, puppeteerConfig
    );
  } catch (err) {
    error = err.friendlyMessage || err.message;
    send(res, error.code || 400, { error });
    return;
  }

  const {
    lhr: {
      categories,
      audits
    },
    report: jsonReport
  } = result;

  // Compile the scores
  const scores = Object.values(categories).reduce((output, { id, score }) => {
    output[id] = score * 100;
    return output;
  }, {});

  const { details: { items: budgets = [] } = {} } = audits['performance-budget'];

  const report = await compress(JSON.stringify(jsonReport), { level: 9 });

  send(res, 200, { scores, budgets, report });
}
