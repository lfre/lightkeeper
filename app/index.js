
const Checks = require('./checks');
const Configuration = require('./configuration');

const {
  APP_NAME: appName = 'Lightkeeper'
} = process.env;

class Lightkeeper {
  constructor(app) {
    this.app = app;
    this.logger = this.app.log.child({ name: appName });
    this.checks = new Checks(appName);
    this.configuration = new Configuration(this);
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
      }
    } = context.payload;

    // Prevent recursion by exiting early from the check_run of this app
    // Additionally, prevent running on unsuccesful builds
    if (name === appName || conclusion !== 'success') return;
    // Exit if this is not a Pull Request check
    if (!pull_requests.length) return;

    const { number: pull_number } = pull_requests[0];
    const config = await this.configuration.getConfiguration(context, {
      head_branch,
      head_sha,
      pull_number,
      github
    });
    if (!config) return;
    const namesToCheck = [name, checkAppName, login].filter(checkName => {
      return checkName.toLowerCase() === config.ci
    });
    // Return if this a different check
    if (!namesToCheck.length) {
      return;
    }

  }
}

module.exports = Lightkeeper;
