const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const lighthouse = require('lighthouse');
const { parse } = require('url');

/* module.exports = async function runLighthouse() {
  const browser = await puppeteer.launch({
    args: chrome.args,
    executablePath: await chrome.executablePath,
    headless: chrome.headless,
  });

  const { lhr } = await lighthouse('https://www.youtube.com/', {
    port: (new URL(browser.wsEndpoint())).port,
    output: 'json',
    logLevel: 'info',
  }); */

let args;
let executablePath;
if (process.platform === "darwin") {
  args = chrome.args.filter(a => a !== "--single-process");
  executablePath = Promise.resolve(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  );
} else {
  args = chrome.args;
  executablePath = chrome.executablePath;
}

async function lh(url) {
  let browser;

  try {
    browser = await puppeteer.launch({
      args,
      executablePath: await executablePath
    });
    const { port } = parse(browser.wsEndpoint());
    return await lighthouse(url, {
      port,
      output: "json",
      logLevel: "error"
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = async (req, res) => {
  let result;
  let lhError;

  try {
    result = await lh(`https://www.youtube.com`);
  } catch (err) {
    if (err.code === "NO_FCP") {
      console.warn(err);
      lhError = err.friendlyMessage || err.message;
    } else {
      throw err;
    }
  }

  let scores;
  let report;
  if (result) {
    scores = Object.values(result.lhr.categories).reduce((o, c) => {
      o[c.id] = c.score;
      return o;
    }, {});
    console.log(scores);
    res.end('ok');
  }
}
