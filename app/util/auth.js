const { Context } = require('probot/lib/context');
const request = require('@octokit/request');

module.exports = async function auth(probotApp, pullNumber, { login, name }, res) {
  const { app, log } = probotApp;
  const jwt = app.getSignedJsonWebToken();
  const {
    data: { id }
  } = await request('GET /repos/:owner/:repo/installation', {
    owner: login,
    repo: name,
    headers: {
      authorization: `Bearer ${jwt}`,
      accept: 'application/vnd.github.machine-man-preview+json'
    }
  });

  if (!id) {
    return res.status(400).send('Failed to retrieve installation id');
  }

  const event = {
    payload: {
      installation: { id },
      repository: {
        name,
        owner: {
          login
        }
      }
    }
  };

  let github;
  let headBranch;
  let headSha;
  let state;
  let context;

  try {
    github = await probotApp.authenticateEvent(event, log);
    context = new Context(event, github, log);
    // get the branch name
    let response = await github.pullRequests.get(context.repo({ pull_number: pullNumber }));
    ({ state, ...response } = response.data);
    ({ ref: headBranch, sha: headSha } = response.head);
  } catch (error) {
    return res.status(error.code || 400).send({
      message: 'Failed to authenticate'
    });
  }
  if (state !== 'open') {
    return res.status(404).send('Pull Request is closed');
  }
  return { context, headBranch, headSha };
};
