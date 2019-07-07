const Status = require('./status');
const Configuration = require('./configuration');
const processComment = require('./comments');
const Runner = require('./runner'); // 🏃
const prepareReport = require('./report');
const { detailsSummary, extendFromSettings, urlFormatter } = require('./util');

class Session {
  constructor(appName, logger) {
    this.appParams = { appName };
    this.logger = logger;
    this.status = new Status(this.appParams);
    this.configuration = new Configuration(this.appParams, this.status);
  }

  setVariables() {
    this.conclusion = 'success';
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
      routes = [],
      settings = {},
      namedSettings = {}
    } = await (config || this.configuration.getConfiguration());

    // return early if the config targets a different type
    // this allows targeting deployments, or older `status` workflows.
    if (typeof isValid === 'function') {
      const ciAppName = ciName.toLowerCase();
      isValid = await isValid(type, [ciAppName, `${ciAppName}[bot]`]);
    }

    if (!baseUrl || !isValid) return;

    // prepare variables since it's valid run
    this.setVariables();

    // Setup the runner, and exit if the url or token are empty
    try {
      this.runner.setup(settings.lighthouse, installationNode);
    } catch (err) {
      this.logger.error('Runner setup failed', err);
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

    // stores curried function to update status
    let status;

    try {
      status = await this.status.create(
        {
          output: {
            title: `Attempting to run tests for ${urlRoutes.length} url${
              urlRoutes.length > 1 ? 's' : ''
            }`,
            summary: 'This is in progress. Please do not re-run until it has finished.'
          }
        },
        checkRun
      );
      this.logger.info('Posted an `in_progress` check to Github');
    } catch (err) {
      this.logger.error('Failed to create `in_progress` status', err);
      return;
    }

    this.logger.info('Started processing URLs...');

    // Process each route and send a request
    await Promise.all(
      this.processRoutes(urlRoutes, {
        settings,
        namedSettings
      })
    );

    this.logger.info('Finished processing URLs');

    const { reportSummary = '', commentSummary = '', getTitle } = prepareReport(
      this.order,
      this.reports
    );

    if (!reportSummary) {
      this.logger.error('Tests came out with empty reports', this.order.join('\n'));
      await status({
        status: 'completed',
        conclusion: 'neutral',
        output: {
          title: 'The tests did not generate any reports',
          summary: `<b>Ran tests for the following URLs:</b>\n${this.order.join('/n')}`
        }
      });
      return;
    }

    // Attempt to post check and comment to Github
    try {
      await Promise.all([
        // github check
        status({
          conclusion: this.conclusion,
          output: {
            title: getTitle(this.conclusion, this.errorsFound),
            summary: reportSummary
          }
        }),
        // comment
        processComment(context, pullNumber, commentSummary)
      ]);
    } catch (err) {
      this.logger.error('Failed to post to Github', err);
      return;
    }

    this.logger.info('Sucessfully posted to Github');
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
        // push route, and add route to report
        this.order.push(route);
        this.reports.set(route, {
          report: detailsSummary(
            `<b>There was an error processing —</b> <i>${route}</i>`,
            'Please check your configuration values'
          )
        });
        return;
      }

      // URLs must be unique after processing,
      // if you need to support multiple runs/budgets, add query params
      if (this.order.includes(urlRoute)) {
        return;
      }

      this.order.push(urlRoute);

      const { categories, budgets, lighthouse, reportOnly } = settings;

      // Skip if no thresholds or budgets have been passed
      // Kinda defeats the purpose of the tool
      if (!categories && !budgets) {
        this.logger.error('No budgets were found in config');
        this.reports.set(urlRoute, {
          report: detailsSummary(
            `<b>No budgets were found in config for —</b> <i>${urlRoute}</i>`,
            'Please include categories or budgets in settings'
          )
        });
        return;
      }

      let data;
      try {
        ({ data } = await this.runner.run(urlRoute, budgets, lighthouse));
      } catch (error) {
        const {
          response: {
            data: {
              error: errorMessage = 'Add an error message from your Lighthouse endpoint.'
            } = {}
          } = {}
        } = error;
        this.logger.error('Lighthouse request failed:', errorMessage);
        this.reports.set(urlRoute, {
          report: detailsSummary(
            `<b>Lighthouse request failed on —</b> <i>${urlRoute}</i>`,
            `\`\`\`\n${errorMessage}\n\`\`\`\n`
          )
        });
        return;
      }

      // store the stats
      const stats = {
        '⬆️': { total: 0, output: '' },
        '✅': { total: 0, output: '' },
        '⚠️': { total: 0, output: '' },
        '❌': { total: 0, output: '' }
      };

      const categoriesOutput = this.processCategories(
        data.categories,
        categories,
        stats,
        reportOnly
      );

      // if budgets exists
      // if it's an array use it to filter
      // if true, use response
      // if reportOnly false check improvements, or errors

      const statsReport = Object.entries(stats).reduce(
        (statsSummary, [icon, { total, output }]) => {
          const iconSummary = ` <b>${total}</b> ${icon}`;
          if (total > 0) {
            statsSummary += iconSummary;
          }
          if (!output) return statsSummary;
          stats[icon].output = detailsSummary(
            `<b>URL - </b><i>${urlRoute}</i><p>&nbsp; &nbsp; <b>Summary — ${iconSummary}`,
            output
          );
          return statsSummary;
        },
        ''
      );

      const report = detailsSummary(
        `<b>URL — </b><i>${urlRoute}</i><p>&nbsp; &nbsp; <b>Summary — </b> ${statsReport}`,
        categoriesOutput,
        data.reportUrl ? `Full Report: ${data.reportUrl}` : ''
      );
      // add to report
      this.reports.set(urlRoute, { report, stats });
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
   * @param {object} stats The tally of errors, warnings and improvements
   * @param {boolean} reportOnly The report setting
   */
  processCategories(response, filter, stats, reportOnly) {
    if (!response) return false;
    const header = `| Category | Score | Threshold | Target | Pass |
| -------- | ----- | ------ | ------ | ------ |`;
    let output = '';
    const addRow = (title, score, threshold, target, pass) => {
      return `| ${title} | ${score} | ${
        threshold === target ? '—' : threshold
      } | ${target} | ${pass} \n`;
    };

    Object.values(response).forEach(({ id, score: sc, title }) => {
      const cat = filter[id];
      if (!cat) return;
      let target = 0;
      let threshold = 0;
      let warning = null;
      let pass = '✅';
      if (typeof cat === 'number') {
        target = cat;
      }
      if (typeof cat === 'object') {
        ({ target = 0, warning, threshold = 0 } = cat);
      }
      if (typeof warning !== 'number') {
        // set warning by default to 25% of threshold
        warning = Math.round((25 / 100) * threshold);
      }
      const score = sc * 100;
      if (!target || typeof target !== 'number') return;

      const thresholdTarget = target - threshold;

      if (thresholdTarget < 0) return;

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
      } else if (threshold && score <= thresholdTarget + warning) {
        pass = '⚠️';
        // add to warning changes
      } else if (score > target) {
        // add to improvements on changes
        pass = '⬆️';
      }
      const row = addRow(title, score, thresholdTarget, target, pass);
      const stat = stats[pass] || {};
      const { hasCategoryHeader = false } = stat;
      stat.total += 1;
      stat.output += hasCategoryHeader ? row : `${header}\n${row}`;
      if (!hasCategoryHeader) {
        stat.hasCategoryHeader = true;
      }
      // add row to general output
      output += row;
    });

    return `${header}\n${output}`;
  }
}

module.exports = Session;
