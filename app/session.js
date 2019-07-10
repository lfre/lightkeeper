const { getStats, processBudgets, processCategories, processLightWallet } = require('./budgets');
const Status = require('./status');
const Configuration = require('./configuration');
const extendFromSettings = require('./settings');
const processComment = require('./comments');
const Runner = require('./runner'); // 🏃
const prepareReport = require('./report');
const { detailsSummary, urlFormatter } = require('./util');

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

    this.settings = settings;
    this.extendSettings = extendFromSettings(settings, namedSettings);

    // Process each route and send a request
    await Promise.all(this.processRoutes(urlRoutes));

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
        commentSummary && processComment(context, pullNumber, commentSummary)
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
   */
  processRoutes(urlRoutes = []) {
    // filter invalid route types
    const filter = route =>
      (typeof route === 'string' && route) || (route && typeof route === 'object' && route.url);

    return urlRoutes.filter(filter).map(this.processRoute.bind(this));
  }

  /**
   * Process an individual route
   * @param {mixed} route The route string or object
   */
  async processRoute(route) {
    const urlRoute = this.urlFormatter(typeof route === 'string' ? route : route.url);
    let routeSettings =
      typeof route === 'object' && typeof route.settings === 'object' ? route.settings : false;

    if (routeSettings) {
      try {
        routeSettings = this.extendFromSettings(routeSettings);
      } catch (err) {
        this.logger.error('There was an error processing the route settings', err);
        // push route, and add route to report
        this.order.push(route);
        this.reports.set(route, {
          report: detailsSummary(
            `❌ <b>There was an error processing —</b> <i>${route}</i>`,
            'Please check your configuration values'
          )
        });
        this.conclusion = 'failure';
        this.errorsFound += 1;
        return;
      }
    }

    // URLs must be unique after processing,
    // if you need to support multiple runs/budgets, add query params
    if (this.order.includes(urlRoute)) {
      return;
    }

    this.order.push(urlRoute);

    const { categories, budgets, lighthouse, reportOnly } = routeSettings || this.settings;

    // Skip if no thresholds or budgets have been passed
    // Kinda defeats the purpose of the tool
    if (!categories && !budgets) {
      this.logger.error('No budgets were found in config');
      this.reports.set(urlRoute, {
        report: detailsSummary(
          `❌ <b>No budgets were found in config for —</b> <i>${urlRoute}</i>`,
          'Please include categories or budgets in settings'
        )
      });
      this.conclusion = 'failure';
      this.errorsFound += 1;
      return;
    }

    let data;

    try {
      ({ data } = await this.runner.run(urlRoute, budgets, lighthouse));
    } catch (error) {
      const { message: errorMessage = 'There was a problem with the Lighthouse request' } = error;
      this.logger.error('Lighthouse request failed:', errorMessage);
      this.reports.set(urlRoute, {
        report: detailsSummary(
          `❌ <b>Lighthouse request failed on —</b> <i>${urlRoute}</i>`,
          `\`\`\`\n${errorMessage}\n\`\`\`\n`
        )
      });
      this.conclusion = 'failure';
      this.errorsFound += 1;
      return;
    }

    // generate the stats object
    const stats = getStats();

    const handleFailures = this.handleFailures(reportOnly);
    const { reportOutput, statsOutput } = processBudgets(urlRoute, stats, [
      processCategories(data.categories, categories, handleFailures),
      processLightWallet(data.budgets, budgets, handleFailures)
    ]);

    const lhVersion = `_Tested with Lighthouse Version: ${data.version}_`;
    const reportUrl = data.reportUrl ? `Full Report: ${data.reportUrl}\n${lhVersion}` : lhVersion;
    // process the full report
    const report = detailsSummary(
      `<b>URL — </b><i>${urlRoute}</i><p>&nbsp; &nbsp; <b>Summary — </b> ${statsOutput}`,
      `${reportOutput}`,
      { reportUrl }
    );

    // add to report
    this.reports.set(urlRoute, { report, stats });
  }

  /**
   * Adds error to global count, changes the conclusion based on settings
   * @param {boolean} reportOnly Denotes if the URL should fail the check run.
   */
  handleFailures(reportOnly) {
    return () => {
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
    };
  }
}

module.exports = Session;
