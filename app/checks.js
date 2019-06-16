
class Checks {
  constructor(appName) {
    this.appName = appName;
  }

  complete(context, github, data = {}) {
    const params = {
      name: this.appName,
      status: 'completed',
      completed_at: new Date()
    };
    return github.checks.create(context.repo({
      ...params,
      ...data
    }));
  }
}

module.exports = Checks
