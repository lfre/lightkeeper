const Status = require('./status');
const Configuration = require('./configuration');
const Runner = require('./runner'); // 🏃
const { extendFromSettings, urlFormatter } = require('./util');

const {
  APP_NAME: appName = 'Lightkeeper',
} = process.env;

class Lightkeeper {
  constructor(app) {
    this.app = app;
    this.logger = this.app.log.child({ name: appName });
    this.appParams = { appName };
    this.status = new Status(this.appParams);
    this.conclusion = '';
    this.configuration = new Configuration(this.appParams, this.status);
    this.errorsFound = 0;
    this.order = [];
    this.reports = new Map();
    this.runner = new Runner();
    this.urlFormatter = null;
    // start listening for events
    this.app.on('check_run.completed', this.onCompletedCheck.bind(this));
    this.app.on('check_run.rerequested', this.onRequestedCheck.bind(this));
  }

  /**
   * Compares multiple names against the name provided in config
   * @param {array} namesToCheck The list of possible CI name
   */
  isValidCheck(namesToCheck = []) {
    return (type, ciName) => {
      const valid = namesToCheck.filter(checkName => {
        return checkName.toLowerCase() === ciName
      });
      // Return if this a different type or check
      if (type !== 'check' || !valid.length) {
        return false;
      }
      return true;
    }
  }

  /**
   * Runs when a check is finished
   * @param {object} context The webhook payload
   */
  async onCompletedCheck(context) {
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

    const { number: pullNumber } = pull_requests[0];

    this.run(
      context,
      null,
      { pullNumber, headBranch, headSha, installationNode },
      this.isValidCheck([name, checkAppName, login])
    );
  }

  /**
   * Runs when a check is re-requested
   * @param {object} The github context
   */
  onRequestedCheck(context) {
    const {
      check_run: {
        id: check_run_id,
        html_url: details_url,
        name,
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

    // Only allow re-request for this app on Pull Requests
    if (name !== appName || !pull_requests.length) return;
    // Exit if this is not a Pull Request check
    const { number: pullNumber } = pull_requests[0];
    const checkRun = { check_run_id, details_url };
    this.run(
      context,
      null,
      { pullNumber, headBranch, headSha, installationNode, checkRun },
      true
    );
  }

  /**
   * Run the tests
   * @param {object} context The github context
   * @param {config} config A pre-processed config
   * @param {mixed} params A validator function or boolean
   * @param {object} macros An optional macro config
   */
  async run(context, config, params = {}, isValid, macros = {}) {
    const {
      headBranch,
      headSha,
      pullNumber,
      installationNode,
      checkRun = {}
   } = params;
    // add to parameters
    Object.assign(this.appParams, {
      context,
      github: context.github,
      headBranch,
      headSha,
      pullNumber
    });

    const {
      baseUrl,
      ci: ciName,
      type = 'check',
      lighthouse: lhConfig,
      routes = [],
      settings = {},
      namedSettings = {}
    } = await (config || this.configuration.getConfiguration());

    // return early if the config targets a different type
    // this allows targeting deployments, or older `status` workflows.
    if (typeof isValid === 'function') {
      isValid = await isValid(type, ciName);
    }

    if (!baseUrl || !isValid) return;

    // Setup the runner, and exit if the url or token are empty
    try {
      this.runner.setup(lhConfig, installationNode);
    } catch (err) {
      this.logger.error(err);
      return;
    }
    // set up the url formatter
    this.urlFormatter = urlFormatter(baseUrl, {
      '{branch}': headBranch,
      '{commit_hash}': headSha,
      '{pr_number}': pullNumber,
      ...macros
    });

    // Setup routes or only run the baseUrl
    const urlRoutes = Array.isArray(routes) && routes.length ? routes : [
      this.urlFormatter() // returns the formatted baseUrl
    ];

    const { data: {
      id: check_run_id,
      html_url: details_url
    } } = await this.status.run({
      status: 'in_progress',
      output: {
        title: `Attempting to run tests for ${urlRoutes.length} url${urlRoutes.length > 1 ? 's' : ''}`,
        summary: ''
      },
      ...checkRun
    }, Object.keys(checkRun).length ? 'update' : false);


    // Process each route and send a request
    await Promise.all(this.processRoutes(urlRoutes, {
      settings,
      namedSettings
    }));

    let summary = '';

    this.order.forEach(route => {
      const result = this.reports.get(route);
      if (!result) return;
      summary += result.report;
    });

    let title = '';

    switch (this.conclusion) {
      case 'failure':
        title = `Found ${this.errorsFound} error${this.errorsFound > 1 ? 's' : ''} across ${this.order.length} url${this.order.length > 1 ? 's' : ''}.`;
        break;
      case 'neutral':
        title = 'Non-critical errors were found.';
        break;
      default:
        title = 'All tests passed! Click Details to see the full report.';
    }

    this.status.run({
      conclusion: this.conclusion,
      check_run_id,
      details_url,
      output: {
        title,
        summary
      }
    }, 'update');
  }

  /**
   * Loops through all routes and runs a lighthouse test
   * @param {array} urlRoutes The routes to test
   * @param {object} settings Base and optional settings
   */
  processRoutes(urlRoutes = [], { settings, namedSettings }) {
    // filter invalid route types
    const filter = route => (
      (typeof route === 'string' && route) ||
      (route && typeof route === 'object' && route.url)
    );

    return urlRoutes.filter(filter).map(this.processRoute(settings, namedSettings));
  }

  /**
   * Process an individual route
   * @param {object} baseSettings The global settings
   * @param {object} namedSettings Shared settings
   */
  processRoute(baseSettings, namedSettings) {
    const extendSettings = extendFromSettings(namedSettings);
    return async (route) => {
      let settings = { ...{}, ...baseSettings };

      try {
        route = this.processRouteSettings(route, settings, extendSettings);
      } catch (err) {
        this.logger.error('There was an error processing the route settings', err);
        return;
      }

      // URLs must be unique after processing,
      // if you need to support multiple runs/budgets, add query params
      if (this.order.includes(route)) {
        return;
      }

      const {
        categories,
        budgets,
        lighthouse,
        reportOnly
      } = settings;

      // Skip if no thresholds or budgets have been passed
      // Kinda defeats the purpose of the tool
      if (!categories && !budgets) {
        this.logger.error('No budgets were found in config');
        return;
      }

      this.order.push(route);

      let data;
      try {
        ({ data } = await this.runner.run(route, budgets, lighthouse));
      } catch (error) {
        this.logger.error('Lighthouse request failed', error);
        this.report.set(route, {
          report: `Lighthouse request failed on ${route}:\n${error.error || error.message}\n---\n`,
          error
        });
        return;
      }

      // store changes and stats
      let stats = {};
      let changes = {
        improvements: [],
        warnings: [],
        errors: []
      };

      const categoriesOutput = this.processCategories(
        data.categories, categories, { changes, stats }, reportOnly
      );

      // if budgets exists
      // if it's an array use it to filter
      // if true, use response
      // if reportOnly false check improvements, or errors

      const statsReport = Object.entries(stats).reduce((output, [icon, value]) => {
        output += ` <b>${value}</b> ${icon}`;
        return output;
      }, '');

      const report = `<details>
<summary><b>URL — </b><i>${route}</i><br>
<p>&nbsp; &nbsp; <b>Summary — </b> ${statsReport}</summary>
</p>
<br>

${categoriesOutput}

<br>
${data.reportUrl ? `Full Report: ${data.reportUrl}` : ''}
</details>

---

`;
      // add to report
      this.reports.set(route, { report, changes, stats });
    }
  }

  /**
   * Process a route's path and settings
   * @param {string} route A pre-processed route
   * @param {object} settings Global settings
   * @param {function} extendSettings The extender function
   */
  processRouteSettings(route, settings, extendSettings) {
    if (typeof route === 'string') {
      route = this.urlFormatter(route);
      return route;
    }

    route = this.urlFormatter(route.url);
    const { routeSettings = null } = route.settings || {};

    // if settings are false, disable the run
    if (routeSettings === false) {
      settings = {};
    } else {
        if (typeof routeSettings === 'string') {
          // settings: 'article'
          extendSettings(routeSettings, settings);
        } else if (routeSettings && typeof routeSettings === 'object') {
          // settings: {
          //   extend: true|'name',
          //   budgets: {...}
          // }
          if (routeSettings.extend) {
            const rawSettings = { extend, ...routeSettings };
            extendSettings(extend, settings, rawSettings);
          }
        }
    }

    return route;
  }

  /**
   * Compares the response scores with the budgets
   * @param {object} response The response object
   * @param {object} filter The budgets object
   * @param {object} param2 The options
   * @param {boolean} reportOnly The report setting
   */
  processCategories(response, filter, { changes, stats }, reportOnly) {
    if (!response) return;
    let header = `| Category | Score | Threshold | Pass |
| -------- | ----- | ------ | ------ |`;
    let output = '';
    const addRow = (title, score, target, threshold, pass) => {
      return `| ${title} | ${score} | ${target} | ${threshold} | ${pass} \n`;
    }

    Object.values(response).forEach(({id, score, title }) => {
      const cat = filter[id];
      if (!cat) return;
      let target = 0;
      let threshold = 0;
      let pass = '✅';
      if (typeof cat === 'number') {
        target = cat;
      }
      if (typeof cat === 'object') {
        ({target, threshold} = cat );
      }
      score = score * 100;
      const thresholdTarget = target - threshold;
      if (score < thresholdTarget) {
        pass = '❌';
        this.errorsFound += 1;
        // if this URL is meant to reportOnly
        // turn status to `neutral`
        // only if a previous URL has not failed already
        // the next URL will override it too.
        if (reportOnly && this.conclusion !== 'failure') {
          this.conclusion = 'neutral';
        } else if (this.conclusion !== 'failure') {
          this.conclusion = 'failure';
        }
        // add to error changes
      } else if (threshold && score === thresholdTarget) {
        pass = '⚠️';
        // add to warning changes
      } else if (score > target) {
        // add to improvements on changes
      }
      output += addRow(title, score, thresholdTarget, pass);
      if (!stats[pass]) {
        stats[pass] = 0;
      }
      stats[pass] += 1
    });
    return `${header}\n${output}`;
  }
}

module.exports = Lightkeeper;
