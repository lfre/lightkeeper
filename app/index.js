const Status = require('./status');
const Configuration = require('./configuration');
const Runner = require('./runner'); // 🏃
const { extendSettings, urlFormatter } = require('./util');

const {
  APP_NAME: appName = 'Lightkeeper',
} = process.env;

class Lightkeeper {
  constructor(app) {
    this.app = app;
    this.logger = this.app.log.child({ name: appName });
    this.appParams = { appName, github: {}, context: {} };
    this.status = new Status(this.appParams);
    this.configuration = new Configuration(this.appParams, this.status);
    this.runner = new Runner();
    this.urlFormatter = null;
    // start listening for completed checks
    this.app.on('check_run.completed', this.onCompletedCheck.bind(this));
  }

  /**
   * Runs when a check is finished
   * @param {object} context The webhook payload
   */
  async onCompletedCheck(context) {
    ({ github: this.appParams.github, ...this.appParams.context } = context);
    // Destructure variables from the event payload
    const {
      check_run: {
        app: {
          owner: {
            login
          },
          name: checkAppName
        },
        name,
        conclusion,
        check_suite: {
          head_branch: headBranch,
          head_sha: headSha
        },
        pull_requests
      },
      installation: {
        node_id: installationNode
      }
    } = context.payload;

    // Prevent recursion by exiting early from the check_run of this app
    // Additionally, prevent running on unsuccesful builds
    if (name === appName || conclusion !== 'success') return;
    // Exit if this is not a Pull Request check
    if (!pull_requests.length) return;

    ({ number: pullNumber } = pull_requests[0]);
    // add to parameters
    this.appParams = { ...this.appParams,
      pullNumber,
      headBranch,
      headSha
    };

    const {
      baseUrl,
      ci: ciName,
      type = 'check',
      lighthouse: lhConfig,
      routes = [],
      settings = {},
      namedSettings = {}
    } = await this.configuration.getConfiguration();
    // return early if the config targets a different type
    // this allows targetting deployments, or older `status` workflows.
    if (!baseUrl || type !== 'check') return;
    const namesToCheck = [name, checkAppName, login].filter(checkName => {
      return checkName.toLowerCase() === ciName
    });
    // Return if this a different check
    if (!namesToCheck.length) {
      return;
    }

    // Setup the runner, and exit if the url or token are empty
    try {
      this.runner.setup(lhConfig, installationNode);
    } catch(err) {
      this.logger.error(err);
      return;
    }
    // set up the url formatter
    this.urlFormatter = urlFormatter(baseUrl, {
      '{branch}': headBranch,
      '{commit_hash}': headSha,
      '{pr_number}': pullNumber
    });

    // Setup routes or only run the baseUrl
    const urlRoutes = Array.isArray(routes) && routes.length ? routes : [
      this.urlFormatter() // returns the formatted baseUrl
    ];

    // Process each route and send a request
    await Promise.all(this.processRoutes(urlRoutes, {
      settings,
      namedSettings
    }));
  }

  /**
   * Loops through all routes and runs a lighthouse test
   * @param {array} urlRoutes The routes to test
   * @param {object} settings Base and optional settings
   */
  processRoutes(urlRoutes = [], { settings, namedSettings }) {
    const { categories = {}, budgets = [], lighthouse = {}, reportOnly = false } = settings;
    // filter invalid route types
    const filter = route => (
      (typeof route === 'string' && route) ||
      (route && typeof route === 'object' && route.url)
    );

    return urlRoutes.filter(filter).map(async (route) => {
      let result;
      const runnerArgs = [];
      const requestSettings = {
        categories,
        budgets,
        lighthouse,
        reportOnly
      };

      if (typeof route === 'string') {
        route = this.urlFormatter(route);
      } else {
        route = this.urlFormatter(route.url);
        const { routeSettings = null } = route.settings || {};

        // if settings are false, pass global options, but disable warnings/errors
        if (routeSettings === false) {
          requestSettings.reportOnly = true;
        } else {
          try {
            if (typeof routeSettings === 'string') {
              // settings: 'article'
              extendSettings(routeSettings, requestSettings);
            } else if (routeSettings && typeof routeSettings === 'object') {
              /*
                settings: {
                  extend: true // extend from global
                  budgets: {...}
                }
              */
              if (routeSettings.extend) {
                const rawSettings = { extend, ...routeSettings };
                extendSettings(extend, requestSettings, rawSettings);
              }
            }
          } catch(err) {

          }
        }
      }

      runnerArgs.push(route);

      try {
        result = await this.runner.run(...runnerArgs);
      } catch (err) {
        this.logger.error('Lighthouse request failed', err);
        return;
      }

      // check that it was a succesfull response
      // run checks
      // add to store with properties
      return result;
    });
  }
}

module.exports = Lightkeeper;
