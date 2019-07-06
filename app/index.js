const Session = require('./session');
const { getPullRequestNumber, isValidCheck } = require('./util');

const { APP_NAME: appName = 'Lightkeeper' } = process.env;

class Lightkeeper {
  constructor(app) {
    this.app = app;
    this.appName = appName;
    // allow getting an initialized version of the app
    app.appInstance = this;
    this.logger = this.app.log.child({ name: appName });
    // start listening for events
    this.app.on('check_run.completed', this.onCompletedCheck.bind(this));
    this.app.on('check_run.rerequested', this.onRequestedCheck.bind(this));
    this.app.on('deployment_status', this.onDeployment.bind(this));
    this.app.on('status', this.onStatus.bind(this));
  }

  /**
   * Runs when a check is finished
   * @param {object} context The webhook payload
   */
  async onCompletedCheck(context) {
    const {
      check_run: {
        app: {
          owner: { login },
          name: checkAppName
        },
        name,
        conclusion,
        check_suite: { head_branch: headBranch, head_sha: headSha },
        pull_requests
      },
      installation: { node_id: installationNode }
    } = context.payload;

    // Prevent recursion by exiting early from the check_run of this app
    // Additionally, prevent running on unsuccesful builds
    if (name === appName || conclusion !== 'success') return;
    // Exit if this is not a Pull Request check
    if (!pull_requests.length) return;

    const { number: pullNumber } = pull_requests[0];

    await this.run(
      context,
      null,
      { pullNumber, headBranch, headSha, installationNode },
      isValidCheck([name, checkAppName, login])
    );
  }

  /**
   * Runs when a check is re-requested
   * @param {object} The github context
   */
  async onRequestedCheck(context) {
    const {
      check_run: {
        id: check_run_id,
        html_url: details_url,
        name,
        check_suite: { head_branch: headBranch, head_sha: headSha },
        pull_requests
      },
      installation: { node_id: installationNode }
    } = context.payload;

    // Only allow re-request for this app on Pull Requests
    if (name !== appName || !pull_requests.length) return;
    // Exit if this is not a Pull Request check
    const { number: pullNumber } = pull_requests[0];
    const checkRun = { check_run_id, details_url };
    await this.run(
      context,
      null,
      { pullNumber, headBranch, headSha, installationNode, checkRun },
      true
    );
  }

  /**
   * Runs tests when a Pull Request deployment is succesful
   * @param {object} context The github context
   */
  async onDeployment(context) {
    const {
      deployment_status: {
        state,
        creator: { login },
        target_url,
        environment
      },
      deployment: { sha: headSha },
      installation: { node_id: installationNode }
    } = context.payload;

    // skip for started or failed statuses
    if (state !== 'success' || !headSha || environment !== 'staging') return;

    const pullNumber = await getPullRequestNumber(context.github, headSha);

    if (!pullNumber) return;

    // get the branch name
    const {
      data: {
        head: { ref: headBranch }
      }
    } = await context.github.pullRequests.get(
      context.repo({
        pull_number: pullNumber
      })
    );

    await this.run(
      context,
      null,
      { pullNumber, headBranch, headSha, installationNode },
      isValidCheck([login], 'deployment'),
      { '{target_url}': target_url }
    );
  }

  /**
   * Runs when a status is posted
   * @param {object} context The github context
   */
  async onStatus(context) {
    const {
      target_url,
      context: name,
      state,
      commit: { sha: headSha },
      branches: [{ name: headBranch }],
      sender: { login },
      installation: { node_id: installationNode }
    } = context.payload;

    if (state !== 'success' || !headSha) return;

    const pullNumber = await getPullRequestNumber(context.github, headSha);

    if (!pullNumber) return;

    await this.run(
      context,
      null,
      { pullNumber, headBranch, headSha, installationNode },
      isValidCheck([name, login], 'status'),
      { '{target_url}': target_url }
    );
  }

  /**
   * Starts a new session
   * @param {object} context The github context
   * @param {config} config A pre-processed config
   * @param {mixed} params A validator function or boolean
   * @param {object} macros An optional macro config
   */
  async run(...args) {
    const session = new Session(this.appName, this.logger);
    await session.start(...args);
  }
}

module.exports = Lightkeeper;
