const axios = require('axios');
const merge = require('lodash.merge');
const { parseConfig } = require('./util');

const { LIGHTHOUSE_URL: lighthouseUrl, WEBHOOK_SECRET: secret } = process.env;

class Runner {
  constructor() {
    this.lighthouseUrl = lighthouseUrl;
    this.lighthouseAuth = secret;
    this.installationNode = '';
    this.options = {};
  }

  /**
   * Sets up the global lighthouse options
   * @param {object} config The global lighthouse config
   * @param {string} installationNode The installation node
   */
  setup(config = {}, installationNode) {
    // If lighthouse options have been passed, override defaults
    const { lhUrl, lhOptions } = parseConfig(config);

    this.options = lhOptions;
    this.installationNode = installationNode;

    /*
      If a custom lighthouse url was provided,
      we use the installation `node_id` as auth by default.
      This will be passed as an `Authorization` header.
      You can also find it using the Github API:
      https://developer.github.com/v3/apps/#get-an-installation
      To "rotate" keys, uninstall and install the app again.
    */
    if (lhUrl && lhUrl !== lighthouseUrl) {
      this.lighthouseUrl = lhUrl;
      this.lighthouseAuth = this.installationNode;
    } else {
      this.options = this.filterOptions();
    }

    if (!this.lighthouseUrl) {
      throw new Error('The Lighthouse endpoint is required');
    }
  }

  /**
   * Filters the request body if using the default LH endpoint.
   * This helps reduce body length and other shenanigans.
   */
  filterOptions(source) {
    const options = source || this.options;
    const keys = ['options', 'config', 'puppeteerConfig'];
    const validated = {};
    keys.forEach(key => {
      const obj = options[key];
      if (obj !== null && typeof obj === 'object' && Object.keys(obj).length) {
        validated[key] = obj;
      }
    });
    return validated;
  }

  /**
   * Sends a request to a Lighthouse endpoint
   * @param {string} url The url to test
   * @param {array} budgets Performance budgets
   * @param {obbject} config Route LH config
   */
  async run(url, budgets, config) {
    let endpointUrl = this.lighthouseUrl;
    let auth = this.lighthouseAuth;
    let requestOptions = { ...{}, ...this.options };

    // If this run has specific lighthouse options, override base
    if (config && typeof config === 'object' && Object.keys(config).length) {
      const { lhUrl, lhOptions } = parseConfig(config);
      requestOptions = merge(requestOptions, lhOptions);
      // This allows a progressive switch to a custom LH endpoint
      if (lhUrl && lhUrl !== lighthouseUrl) {
        endpointUrl = lhUrl;
        auth = this.installationNode;
      } else {
        requestOptions = this.filterOptions(requestOptions);
      }
    }
    let headers = {
      Authorization: auth
    };
    // attempt to get optional headers
    ({ headers = headers, ...requestOptions } = requestOptions);
    // add performance-bugets
    if (Array.isArray(budgets) && budgets.length) {
      const settings = { budgets };
      requestOptions.config = { ...(requestOptions.config && {}), settings };
    }

    return axios({
      url: endpointUrl,
      method: 'post',
      data: {
        ...requestOptions,
        url // this is the url to test
      },
      timeout: 60000,
      headers
    });
  }
}

module.exports = Runner;
