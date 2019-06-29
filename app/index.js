const Checks = require('./checks');
const Configuration = require('./configuration');
const Runner = require('./runner'); // 🏃
const { replaceMacros, urlFormatter } = require('./util');

const {
  APP_NAME: appName = 'Lightkeeper',
} = process.env;

class Lightkeeper {
  constructor(app) {
    this.app = app;
    this.logger = this.app.log.child({ name: appName });
    this.checks = new Checks(appName);
    this.configuration = new Configuration(this);
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
    const { github } = context;
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
          head_branch,
          head_sha
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

    const { number: pull_number } = pull_requests[0];
    const {
      baseUrl,
      ci: ciName,
      type = 'check',
      lighthouse: lhConfig,
      routes = [],
      settings = {},
      namedSettings = {}
    } = await this.configuration.getConfiguration(context, {
      head_branch,
      head_sha,
      pull_number,
      github
    });
    // return early if the config targets a different type
    // this allows targetting deployments, or older `status` workflows.
    if (!baseUrl || type !== 'check') return;
    const namesToCheck = [name, checkAppName, login].filter(checkName => {
      return checkName.toLowerCase() === ciName
    });
    // Return if this a different check
    if (!namesToCheck.length) {
      console.log(ciName);
      return;
    }

    // Setup the runner, and exit if the url or token are empty
    try {
      this.runner.setup(lhConfig, installationNode);
    } catch(err) {
      this.logger.error(err);
      return;
    }

    // Set macros
    const macros = {
      '{branch}': head_branch,
      '{commit_hash}': head_sha,
      '{pr_number}': pull_number
    };

    // set up the utility that formats urls
    this.urlFormatter = urlFormatter(baseUrl, macros);

    // Setup routes or only run the baseUrl
    const urlRoutes = Array.isArray(routes) && routes.length ? routes : [
      this.urlFormatter()
    ];

    // Process each route and send a request
    const results = await Promise.all(this.processRoutes(urlRoutes, {
      settings,
      namedSettings
    }));

    console.log(results);
  }

  /**
   * Loops through all routes and runs a lighthouse test
   * @param {array} urlRoutes The routes to test
   * @param {object} settings Base and optional settings
   */
  processRoutes(urlRoutes = [], { settings, namedSettings }) {
    const { categories, budgets, lighthouse, reportOnly } = settings;
    // filter invalid route types
    const filter = route => (
      typeof route === 'string' ||
      (route !== null && typeof route === 'object')
    );

    return urlRoutes.filter(filter).map(async (route) => {
      let result;

      if (typeof route === 'string') {
        route = this.urlFormatter(route);
        result = await this.runner.run(route, budgets, lighthouse);
      }
      // check that it was a succesfull response
      // run checks
      // add to store with properties
      return result;
    });
  }
}

module.exports = Lightkeeper;
