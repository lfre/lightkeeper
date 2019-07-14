const { CONFIG_FILE_PATH = '.github/lightkeeper.json' } = process.env;

class Configuration {
  constructor(params, status, detailsUrl) {
    this.params = params;
    this.status = status;
    this.detailsUrl = detailsUrl;
    this.requiredKeys = ['baseUrl', 'ci', 'type'];
  }

  /**
   * Gets the configuration file contents from the PR or base branch
   */
  async getConfigFile() {
    const { context, github, headBranch: ref, pullNumber: pull_number } = this.params;
    const { owner, repo } = context.repo();
    const { data: prFiles } = await github.pullRequests.listFiles(context.repo({ pull_number }));
    let prFile = false;

    prFiles.some(({ filename, status }) => {
      if (filename === CONFIG_FILE_PATH) {
        // If a PR is removing the config
        // prevent fallback
        if (status === 'removed') {
          const error = new Error();
          error.status = 404;
          throw error;
        }
        prFile = true;
        return prFile;
      }
      return prFile;
    });

    // If a PR is adding/modifying a config, use that
    if (prFile) {
      return github.repos.getContents({
        owner,
        repo,
        path: CONFIG_FILE_PATH,
        ref
      });
    }

    return github.repos.getContents({
      owner,
      repo,
      path: CONFIG_FILE_PATH
    });
  }

  /**
   * Gets and validates the configuration file
   */
  async getConfiguration() {
    let configuration = {};
    let missingKeys = this.requiredKeys;
    let parseError = false;
    try {
      const {
        data: { content }
      } = await this.getConfigFile();
      configuration = JSON.parse(Buffer.from(content, 'base64').toString());
    } catch (error) {
      // Exit early if config was not found
      // A neutral check used to be here,
      // but since it could be confusing to other repos in the same org
      // it was removed. See the history of the lines below.
      if (error.status === 404) {
        return configuration;
      }
      parseError = error.message;
    }
    // Check for required keys
    if (configuration) {
      missingKeys = missingKeys.filter(
        key => !(configuration[key] && typeof configuration[key] === 'string')
      );
      if (missingKeys.length) {
        let outputTitle = `Missing required keys or invalid types: ${missingKeys.join(', ')}`;
        if (parseError) {
          outputTitle = parseError;
        }
        const { output: { title = '' } = {} } = await this.status.find();
        if (title === outputTitle) {
          return {};
        }
        this.status.run({
          conclusion: 'action_required',
          output: {
            title: outputTitle,
            summary: this.detailsUrl
          }
        });
        return {};
      }
      // standardize CI name
      configuration.ci = configuration.ci.toLowerCase();
    }
    return configuration;
  }
}

module.exports = Configuration;
