const Status = require('./status');
const Configuration = require('./configuration');
const Runner = require('./runner'); // 🏃
const { extendFromSettings, urlFormatter } = require('./util');

class Session {
  constructor(appName) {
    this.appParams = { appName };
    this.status = new Status(this.appParams);
    this.conclusion = 'success';
    this.configuration = new Configuration(this.appParams, this.status);
    this.errorsFound = 0;
    this.order = [];
    this.reports = new Map();
    this.runner = new Runner();
    this.urlFormatter = null;
  }

  /**
   * Starts a new session
   * @param {object} context The github context
   * @param {config} config A pre-processed config
   * @param {mixed} params A validator function or boolean
   * @param {object} macros An optional macro config
   */
  async start(context, config, params = {}, isValid, macros = {}) {
    const { headBranch, headSha, pullNumber, installationNode, checkRun = {} } = params;

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
    const urlRoutes =
      Array.isArray(routes) && routes.length
        ? routes
        : [
            this.urlFormatter() // returns the formatted baseUrl
          ];

    const {
      data: { id: check_run_id, html_url: details_url }
    } = await this.status.run(
      {
        status: 'in_progress',
        output: {
          title: `Attempting to run tests for ${urlRoutes.length} url${
            urlRoutes.length > 1 ? 's' : ''
          }`,
          summary: ''
        },
        ...checkRun
      },
      Object.keys(checkRun).length ? 'update' : undefined
    );

    // Process each route and send a request
    try {
      await Promise.all(
        this.processRoutes(urlRoutes, {
          settings,
          namedSettings
        })
      );
    } catch (err) {
      await this.status.run({
        status: 'completed',
        conclusion: 'failure',
        output: {
          title: 'Errors were found attempting to run the Lighthouse tests',
          summary: `
            Attempted to run:

            ${this.order.join('/n')}
          `
        }
      });
      return;
    }

    let summary = '';

    this.order.forEach(route => {
      const result = this.reports.get(route);
      if (!result) return;
      summary += result.report;
    });

    if (!summary) {
      await this.status.run({
        status: 'completed',
        conclusion: 'failure',
        output: {
          title: 'Tests were succesful but did not generate any reports',
          summary: ''
        }
      });
      return;
    }

    let title = '';

    switch (this.conclusion) {
      case 'failure':
        title = `Found ${this.errorsFound} error${this.errorsFound > 1 ? 's' : ''} across ${
          this.order.length
        } url${this.order.length > 1 ? 's' : ''}.`;
        break;
      case 'neutral':
        title = 'Non-critical errors were found.';
        break;
      default:
        title = 'All tests passed! See the full report. ➡️';
    }

    await this.status.run(
      {
        conclusion: this.conclusion,
        check_run_id,
        details_url,
        output: {
          title,
          summary
        }
      },
      'update'
    );
  }

  /**
   * Loops through all routes and runs a lighthouse test
   * @param {array} urlRoutes The routes to test
   * @param {object} settings Base and optional settings
   */
  processRoutes(urlRoutes = [], { settings, namedSettings }) {
    // filter invalid route types
    const filter = route =>
      (typeof route === 'string' && route) || (route && typeof route === 'object' && route.url);

    return urlRoutes.filter(filter).map(this.processRoute(settings, namedSettings));
  }

  /**
   * Process an individual route
   * @param {object} baseSettings The global settings
   * @param {object} namedSettings Shared settings
   */
  processRoute(baseSettings, namedSettings) {
    const extendSettings = extendFromSettings(namedSettings);
    return async route => {
      let urlRoute;
      const settings = { ...{}, ...baseSettings };

      try {
        urlRoute = this.processRouteSettings(route, settings, extendSettings);
      } catch (err) {
        this.logger.error('There was an error processing the route settings', err);
        return;
      }

      // URLs must be unique after processing,
      // if you need to support multiple runs/budgets, add query params
      if (this.order.includes(urlRoute)) {
        return;
      }

      const { categories, budgets, lighthouse, reportOnly } = settings;

      // Skip if no thresholds or budgets have been passed
      // Kinda defeats the purpose of the tool
      if (!categories && !budgets) {
        this.logger.error('No budgets were found in config');
        return;
      }

      this.order.push(urlRoute);

      let data;
      try {
        ({ data } = await this.runner.run(urlRoute, budgets, lighthouse));
      } catch (error) {
        this.logger.error('Lighthouse request failed', error);
        this.report.set(urlRoute, {
          report: `Lighthouse request failed on ${urlRoute}:\n${error.error ||
            error.message}\n---\n`,
          error
        });
        return;
      }

      // store changes and stats
      const stats = {};
      const changes = {
        improvements: [],
        warnings: [],
        errors: []
      };

      const categoriesOutput = this.processCategories(
        data.categories,
        categories,
        { changes, stats },
        reportOnly
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
    };
  }

  /**
   * Process a route's path and settings
   * @param {string} route A pre-processed route
   * @param {object} settings Global settings
   * @param {function} extendSettings The extender function
   */
  processRouteSettings(route, settings, extendSettings) {
    let urlRoute;
    if (typeof route === 'string') {
      urlRoute = this.urlFormatter(route);
      return urlRoute;
    }

    urlRoute = this.urlFormatter(route.url);
    const { routeSettings = null } = route.settings || {};

    // if settings are false, disable the run
    if (routeSettings === false) {
      settings = {};
    } else if (typeof routeSettings === 'string') {
      // settings: 'article'
      extendSettings(routeSettings, settings);
    } else if (routeSettings && typeof routeSettings === 'object') {
      // settings: {
      //   extend: true|'name',
      //   budgets: {...}
      // }
      if (routeSettings.extend) {
        const { extend, ...rawSettings } = routeSettings;
        extendSettings(extend, settings, rawSettings);
      }
    }

    return urlRoute;
  }

  /**
   * Compares the response scores with the budgets
   * @param {object} response The response object
   * @param {object} filter The budgets object
   * @param {object} param2 The options
   * @param {boolean} reportOnly The report setting
   */
  processCategories(response, filter, { stats }, reportOnly) {
    if (!response) return false;
    const header = `| Category | Score | Threshold | Pass |
| -------- | ----- | ------ | ------ |`;
    let output = '';
    const addRow = (title, score, target, threshold, pass) => {
      return `| ${title} | ${score} | ${target} | ${threshold} | ${pass} \n`;
    };

    Object.values(response).forEach(({ id, score: sc, title }) => {
      const cat = filter[id];
      if (!cat) return;
      let target = 0;
      let threshold = 0;
      let pass = '✅';
      if (typeof cat === 'number') {
        target = cat;
      }
      if (typeof cat === 'object') {
        ({ target, threshold } = cat);
      }
      const score = sc * 100;
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
      stats[pass] += 1;
    });

    return `${header}\n${output}`;
  }
}

module.exports = Session;