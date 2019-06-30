const axios = require('axios');
const {
  LIGHTHOUSE_URL: lighthouseUrl,
  WEBHOOK_SECRET: secret,
} = process.env;

class Runner {
  constructor() {
    this.lighthouseUrl = lighthouseUrl;
    this.lighthouseAuth = secret;
    this.installationNode = '';
    this.options = {};
  }

  /**
   * Parses the global lighthouse options
   *
   * @param {object} config The lighthouse config
   */
  parseConfig(config = {}) {
    let lhUrl;
    let lhOptions = {};

    // If lighthouse options have been passed, override defaults
    if (typeof config === 'string' && config) {
      lhUrl = config;
    } else if (typeof config === 'object') {
      ({
        url: lhUrl,
        ...lhOptions
      } = config);
    }

    return { lhUrl, lhOptions };
  }

  /**
   * Sets up the global lighthouse options
   * @param {object} config The global lighthouse config
   * @param {string} installationNode The installation node
   */
  setup(config = {}, installationNode) {
    // If lighthouse options have been passed, override defaults
    const { lhUrl, lhOptions } = this.parseConfig(config);

    this.options = lhOptions;
    this.installationNode = installationNode;

    /*
      If a custom lighthouse url was provided,
      we use the installation `node_id` as auth.
      This will be passed as an `Authorization` header.
      You can also find it using the Github API:
      https://developer.github.com/v3/apps/#get-an-installation

      This is better than anything for the moment.
      Suggestions welcome (without accessing user code).

      To "rotate" keys, uninstall and install the app again.
    */
    if (lhUrl && lhUrl !== lighthouseUrl) {
      this.lighthouseUrl = lhUrl;
      this.lighthouseAuth = this.installationNode;
    } else {
      this.filterOptions();
    }

    if (!this.lighthouseUrl || !this.lighthouseAuth){
      throw new Error('The Lighthouse endpoint and auth token are required');
    }
  }

  /**
   * Filters the request body if using the default LH endpoint.
   * This helps reduce body length and other shenanigans.
   */
  filterOptions() {
    const keys = ['options', 'config', 'puppeteerConfig'];
    const validated = {};
    keys.forEach(key => {
      const obj = this.options[key];
      if (obj !== null && typeof obj === 'object' && Object.keys(obj).length) {
        validated[key] = obj;
      }
    });
    this.options = validated;
  }

  /**
   * Sends a request to a Lighthouse endpoint
   * @param {string} url The url to test
   * @param {object} budgets Performance budgets
   * @param {obbject} config Route LH config
   */
  async run(url, budgets, config) {
    let endpointUrl = this.lighthouseUrl;
    let auth = this.lighthouseAuth;
    let requestOptions = this.options;

    // If this run has specific lighthouse options, override base
    if (config) {
      const { lhUrl, lhOptions } = this.parseConfig(config);
      requestOptions = { ...requestOptions, lhOptions };
      // This allows a progressive switch to a custom LH endpoint
      if (lhUrl && lhUrl !== lighthouseUrl) {
        endpointUrl = lhUrl;
        auth = this.installationNode;
      }
    }
    // add performance-bugets
    if (budgets) {
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
      headers: {
        Authorization: auth
      }
    });
  }
}

module.exports = Runner;
