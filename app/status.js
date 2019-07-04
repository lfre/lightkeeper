class Status {
  constructor(params) {
    this.params = params;
  }

  /**
   * Adds/updates a check run.
   * @param {object} data The status options
   * @param {string} method The check method
   */
  run(options = {}, method) {
    const {
      appName: name,
      context,
      github,
      headBranch: head_branch,
      headSha: head_sha,
    } = this.params;
    method = method || 'create';

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

module.exports = Status
