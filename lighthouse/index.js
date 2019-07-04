// This is a fix for Node v.8
// Remove when v.10 is supported in chrome-aws-lamdba
// https://github.com/alixaxel/chrome-aws-lambda#usage
// https://github.com/alixaxel/chrome-aws-lambda/issues/37
global.URL = require('url').URL;

const { createHmac, pseudoRandomBytes, timingSafeEqual } = require('crypto');
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const lighthouse = require('lighthouse');
const { parse } = require('url');
const { send } = require('micro');
const defaultConfig = require('./default.json');

const { log } = console;

const { WEBHOOK_SECRET: secret, EXEC_PATH: execPath } = process.env;

let args;
let executablePath;

if (process.platform === 'darwin') {
  args = chrome.args.filter(a => a !== '--single-process');
  executablePath = Promise.resolve(execPath);
} else {
  ({ args, executablePath } = chrome);
}

/**
 * Runs a Lighthouse test
 * @param {string} url The url to run
 * @param {object} options The lighthouse options
 * @param {object} config The lighthouse config
 * @param {object} pupConfig The puppeteer config
 */
async function lh(url, options = {}, config = {}, pupConfig = {}) {
  let browser;

  try {
    browser = await puppeteer.launch({
      ...pupConfig,
      args,
      executablePath: await executablePath
    });
    const { port } = parse(browser.wsEndpoint());
    return await lighthouse(url, { ...options, port, output: 'html', logLevel: 'error' }, config);
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
function timeSafeCompare(a, b) {
  const sa = String(a);
  const sb = String(b);
  const key = pseudoRandomBytes(32);
  const ah = createHmac('sha256', key)
    .update(sa)
    .digest();
  const bh = createHmac('sha256', key)
    .update(sb)
    .digest();

  return timingSafeEqual(ah, bh) && a === b;
}

/**
 * Parses the body data
 * @param {object} req The request object
 * @param {object} res The response oject
 */
async function json(req, res) {
  return new Promise(resolve => {
    let body = '';

    req.on('data', function onData(data) {
      body += data;
      if (body.length > 1e6) {
        send(res, 413, {
          error: 'Request too large'
        });
      }
    });

    req.on('end', function onEnd() {
      resolve(JSON.parse(body));
    });
  });
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
  // TODO: Switch to `json` from micro again when its fixed
  const { url, options = {}, config = {}, puppeteerConfig = {} } = await json(req, res);

  if (!url) {
    send(res, 400, {
      error: 'The URL is missing'
    });
    return;
  }

  if (!url.startsWith('http')) {
    send(res, 400, {
      error: 'The URL must start with http'
    });
    return;
  }

  try {
    result = await lh(url, options, { ...defaultConfig, config }, puppeteerConfig);
  } catch (err) {
    error = err.friendlyMessage || err.message;
    send(res, error.code || 400, { error });
    return;
  }

  const {
    lhr: { categories: lhCategories, audits },
    report // eslint-disable-line
  } = result;

  // Compile the scores
  const categories = Object.values(lhCategories).reduce((output, { id, title, score }) => {
    output[id] = { id, score, title };
    return output;
  }, {});

  const { details: { items: budgets = [] } = {} } = audits['performance-budget'];

  log(`Finished running Lighthouse test for: ${url}`);

  send(res, 200, { categories, budgets });
};
