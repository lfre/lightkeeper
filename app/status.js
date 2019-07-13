class Status {
  constructor(params) {
    this.params = params;
  }

  /**
   * Creates a status run, and returns a function for updating it
   * @param {object} params The status parameters
   * @param {object} checkRun A previous optional check-run e.g re-request
   */
  async create(params, checkRun = {}) {
    const {
      data: { id: check_run_id, html_url: details_url }
    } = await this.run(
      {
        status: 'in_progress',
        ...params,
        ...checkRun
      },
      Object.keys(checkRun).length ? 'update' : undefined
    );

    return async runParams => {
      await this.run(
        {
          ...runParams,
          check_run_id,
          details_url
        },
        'update'
      );
    };
  }

  /**
   * Finds an existing check run from this application
   */
  async find() {
    const { appName, context, github, headSha: ref } = this.params;
    const {
      data: { check_runs: checkRuns = [] }
    } = await github.checks.listForRef(
      context.repo({
        ref
      })
    );

    let checkRunOutput = {};

    checkRuns.some(({ name, ...checkRun }) => {
      if (name === appName) {
        checkRunOutput = checkRun;
        return true;
      }
      return false;
    });

    return checkRunOutput;
  }

  /**
   * Adds/updates a check run.
   * @param {object} data The status options
   * @param {string} method The check method
   */
  run(options = {}, method = 'create') {
    const {
      appName: name,
      context,
      github,
      headBranch: head_branch,
      headSha: head_sha
    } = this.params;

    const params = {
      head_branch,
      head_sha,
      name,
      status: 'completed',
      ...options
    };
    const date = new Date();

    if (params.status === 'completed') {
      params.completed_at = date;
    } else {
      params.started_at = date;
    }

    return github.checks[method](context.repo(params));
  }
}

module.exports = Status;
