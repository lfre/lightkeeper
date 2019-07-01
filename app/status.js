class Status {
  constructor(params) {
    this.params = params;
  }

  complete(data = {}) {
    const {
      appName: name,
      context,
      github,
      headBranch: head_branch,
      headSha: head_sha,
    } = this.params;

    const params = {
      head_branch,
      head_sha,
      name,
      status: 'completed',
      completed_at: new Date()
    };
    return github.checks.create(context.repo({
      ...params,
      ...data
    }));
  }
}

module.exports = Status
