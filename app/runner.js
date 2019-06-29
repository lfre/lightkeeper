const axios = require('axios');
const {
  LIGHTHOUSE_URL: lighthouseUrl,
  WEBHOOK_SECRET: secret,
} = process.env;

class Runner {
  constructor() {
    this.lighthouseUrl = lighthouseUrl;
    this.lighthouseAuth = secret;
    this.instance = null;
    this.instanceSettings = {};
    this.installationNode = null;
    this.options = {};
  }

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

  setup(config = {}, installationNode) {
    // If lighthouse options have been passed, override defaults
    const { lhUrl, lhOptions } = this.parseConfig(config);

    this.options = lhOptions;
    this.installationNode = installationNode;

    if (lhUrl) {
      this.lighthouseUrl = lhUrl;
    }

    /*
      If a custom lighthouse url was provided
      use the installation `node_id` as auth
      This will be passed as an `Authentication` header
      You can also find it using the Github API:
      See: https://developer.github.com/v3/apps/#get-an-installation

      This is better than anything for the momentt
      so I welcome any suggestions here (without accessing code).

      To "rotate" keys, uninstall and install the app again 🤷
    */
    if (this.lighthouseUrl !== lighthouseUrl) {
      this.lighthouseAuth = this.installationNode;
    }

    if (!this.lighthouseUrl || !this.lighthouseAuth){
      throw new Error('The Lighthouse endpoint and auth token are required');
    }

    this.instanceSettings = {
      baseUrl: this.lighthouseUrl,
      timeout: 1000,
      headers: {
        Authentication: this.lighthouseAuth
      }
    };

    this.instance = axios.create(this.instanceSettings);
  }

  async run(url, budgets, config) {
    let endpointUrl;
    let auth = this.lighthouseAuth;
    let requestOptions = this.options;

    // If this run has specific lighthouse options, override base
    if (config) {
      const { lhUrl, lhOptions } = this.parseConfig(config);
      requestOptions = { ...requestOptions, lhOptions };
      if (lhUrl) {
        endpointUrl = lhUrl;
        if (lhUrl !== this.lighthouseUrl) {
          auth = this.installationNode;
        }
      }
    }
    // add performance-bugets
    if (budgets) {
      const settings = { budgets };
      requestOptions.config = { ...(requestOptions.config && {}), settings };
    }

    const instance = endpointUrl ? axios.create({ ...this.instanceSettings,
      baseUrl: endpointUrl,
      headers: {
        Authentication: auth
      }
    }) : this.instance;

    // validate options if using the embedded lighthouse to reduce body size
    if (!endpointUrl || this.lighthouseUrl === lighthouseUrl) {
      const keys = [ 'options', 'config', 'puppeteerConfig' ];
      const validated = {};
      keys.forEach(key => {
        const obj = requestOptions[key];
        if (obj !== null && typeof obj === 'object' && Object.keys(obj).length) {
          validated[key] = obj;
        }
      });
      requestOptions = validated;
    }

    return instance.post('/', {
      data: {
        ...requestOptions,
        url
      }
    })
  }
}

module.exports = Runner;
