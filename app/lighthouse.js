const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const lighthouse = require('lighthouse');
const { URL } = require('url');

module.exports = async function runLighthouse() {
  /* const browser = await puppeteer.launch({
    args: chrome.args,
    executablePath: await chrome.executablePath,
    headless: chrome.headless,
  });

  const { lhr } = await lighthouse('https://www.youtube.com/', {
    port: (new URL(browser.wsEndpoint())).port,
    output: 'json',
    logLevel: 'info',
  });

  console.log(`Lighthouse scores: ${Object.values(lhr.categories).map(c => c.score).join(', ')}`);

  await browser.close(); */
}
