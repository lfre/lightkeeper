#!/usr/bin/env node
const minimist = require('minimist');
const https = require('https');

const {
  LIGHTKEEPER_HOST: lkHost = 'app.lightkeeper.dev',
  LIGHTKEEPER_API_KEY: apiKey = '',
  TRAVIS_PULL_REQUEST: travisPR,
  TRAVIS_PULL_REQUEST_SLUG: travisPRSlug
} = process.env;
const cwd = process.cwd();
const args = process.argv.slice(2);

const {
  _: [baseUrl],
  help,
  pr,
  repo: repoSlug,
  'config-path': configPath
} = minimist(args, {
  boolean: ['help'],
  string: ['repo', 'config-path'],
  number: ['pr'],
  default: {
    pr: ~~travisPR, // eslint-disable-line
    repo: travisPRSlug,
    'config-path': '.github/lightkeeper.json'
  },
  alias: { help: 'h' }
});
const { error, log } = console;

function printUsageAndExit() {
  const usage = `
LightkeeperBot requires the Github App to be installed.
https://github.com/apps/lightkeeper-ci.

Set a LIGHTKEEPER_HOST environment variable to override.

Usage:

lightkeeperbot [--pr=123] [--repo=owner/name] [--config-path=config/lightkeeper.(js|json)] <baseUrl>

Options:
  --pr         [Number] The Pull Request number.
                        Default: TRAVIS_PULL_REQUEST.
  --repo       [String] The repo's owner and name joined by a slash (owner/repo).
                        E.g: https://github.com/[owner]/[name].
                        Default: TRAVIS_PULL_REQUEST_SLUG.
  --config     [String] The configuration path.
                        Default: .github/lightkeeper.json.
  --help                Prints help.

Examples:
  Runs Lightkeeper with default values:
    lightkeeperbot https://example.com
  Pass a custom configuration:
    lightkeeperbot https://example.com --config-path=.github/lightkeeper.js
      If using .json, set the "ci" property to "lightkeeperbot" to prevent
      double runs, or failing the app's validation process.
      If the file is .js and exports a function, the URL will be sent as an argument.
      Expects to return a JSON-like object.
  `;
  log(usage);
  process.exit(1);
}

if (help) {
  printUsageAndExit();
}

if (!pr) {
  log('Lightkeeper is only for Pull Requests. Empty --pr found.');
  process.exit();
}

if (!repoSlug) {
  log('--repo is required.');
  printUsageAndExit();
}

if (typeof pr !== 'number') {
  log('--pr needs to be a number');
  printUsageAndExit();
} else if (
  typeof config !== 'string' &&
  !(configPath.endsWith('.js') || configPath.endsWith('.json'))
) {
  log('--config-path needs to be a .js or .json file path');
  printUsageAndExit();
} else if (typeof repoSlug !== 'string' && !repoSlug.includes('/')) {
  log('--repo needs to be a string, and joined by a slash');
}

const configFilePath = `${cwd}/${configPath}`;
const [owner, name] = repoSlug.split('/');

function sendRequest(body = {}) {
  const requestBody = JSON.stringify(body);
  const options = {
    hostname: lkHost,
    method: 'POST',
    path: '/run',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'Content-Length': requestBody.length
    }
  };
  return new Promise((resolve, reject) => {
    let response = '';
    const req = https.request(options, res => {
      res.on('data', function onData(data) {
        response += data;
      });
      res.on('end', function onEnd() {
        resolve(JSON.parse(response));
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

async function run() {
  let config;
  try {
    config = require(configFilePath); // eslint-disable-line
  } catch (err) {
    error('Configuration missing or with errors in:\n', configFilePath, '\n\n', err);
    process.exit(1);
  }
  if (typeof config === 'function') {
    try {
      config = await config(baseUrl);
    } catch (err) {
      error(`Errors found in configuration:\n\n`, err);
      process.exit(1);
    }
  }
  if (!config && typeof config !== 'object') {
    log('The configuration needs to be a JSON-like object');
    process.exit(1);
  }
  const requestParams = {
    pr,
    config,
    repo: {
      owner,
      name
    }
  };

  if (baseUrl) {
    requestParams.macros = {
      '{base_url}': baseUrl
    };
  }

  let message = 'Process ran succesfully';

  try {
    ({ message = message } = await sendRequest(requestParams));
  } catch (err) {
    error(`There was a problem with the request: ${err.message}`);
    process.exit(1);
  }

  log(message);
}

run();
