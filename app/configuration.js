const { homepage } = require('../package.json');
const {
  CONFIG_FILE_PATH = '.github/lightkeeper.json',
} = process.env;

class Configuration {
  constructor(app) {
    this.app = app;
    this.detailsUrl = `${homepage}/docs#configuration`;
    this.requiredKeys = ['baseUrl', 'ci'];
  }

  /**
   * Gets the configuration file contents from the PR or base branch
   * @param {object} context The event context object
   * @param {object} {head_branch, pull_number, github} Payload parameters
   */
  async getConfigFile(context, { head_branch, pull_number, github }) {
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

  async getConfiguration(context, { head_branch, head_sha, pull_number, github }) {
    let configuration = false;
    let missingKeys = this.requiredKeys;
    try {
      const { data: { content } } = await this.getConfigFile(context, { head_branch, pull_number, github });
      configuration = JSON.parse(Buffer.from(content, 'base64').toString());
    } catch (error) {
      if (error.status === 404) {
        this.app.checks.complete(context, github, {
          head_branch,
          head_sha,
          conclusion: 'neutral',
          output: {
            title: `Missing configuration file: ${CONFIG_FILE_PATH}`,
            summary: `More info at: ${this.detailsUrl}`,
            details_url: this.detailsUrl
          }
        });
      }
    }
    // Check for required keys
    if (configuration) {
      missingKeys = missingKeys.filter(key => !(configuration[key] && typeof configuration[key] === 'string'));
      if (missingKeys.length) {
        this.app.checks.complete(context, github, {
          head_branch,
          head_sha,
          conclusion: 'action_required',
          output: {
            title: `Missing required keys or invalid types: ${missingKeys.join(',')}`,
            summary: `More info at: ${this.detailsUrl}`,
            details_url: this.detailsUrl
          }
        })
      }
      // standardize CI name
      configuration.ci = configuration.ci.toLowerCase();
    }
    return configuration;
  }
}

module.exports = Configuration;
