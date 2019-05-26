const {
  APP_NAME = 'Lightkeeper',
  CONFIG_FILE_PATH = '.github/lightkeeper.json',
} = process.env;

class Lightkeeper {
  constructor(app) {
    this.app = app;
    this.logger = this.app.log.child({ name: APP_NAME })
    // start listening for completed checks
    this.app.on('check_run.completed', this.onCompletedCheck.bind(this));
  }

  async getConfiguration(context, { head_branch, pull_number, github }) {
    const { owner, repo } = context.repo();

    const { data: prFiles } = await github.pullRequests.listFiles(
      context.repo({ pull_number })
    );
    const modifiedFiles = prFiles
      .filter(file => ['modified', 'added'].includes(file.status))
      .map(file => file.filename)

    // check if the PR has a modified configuration
    if (modifiedFiles.includes(CONFIG_FILE_PATH)) {
      return github.repos.getContents({
        owner,
        repo,
        path: CONFIG_FILE_PATH,
        ref: head_branch
      })
    }
    return github.repos.getContents({
      owner,
      repo,
      path: CONFIG_FILE_PATH
    })
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
    if (name === APP_NAME || conclusion !== 'success') return;
    // Exit if this is not a Pull Request check
    if (!pull_requests.length) return;

    const { number: pull_number } = pull_requests[0];
    let configuration
    try {
      configuration = await this.getConfiguration(context, { head_branch, pull_number, github });
    } catch(error) {
      if (error.status === 404) {
        return github.checks.create(context.repo({
          name: APP_NAME,
          head_branch,
          head_sha,
          status: 'completed',
          conclusion: 'neutral',
          completed_at: new Date(),
          output: {
            title: 'Missing configuration file .github/lightkeeper.json',
            summary: 'More info at http://ligthkeeper.alfre.do/docs#configuration',
            details_url: 'http://lightkeeper.alfre.do/docs#configuration'
          }
        }))
      }
    }
  }
}

module.exports = Lightkeeper;
