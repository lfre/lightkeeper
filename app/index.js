const Session = require('./session');
const { getPullRequestNumber, isValidCheck } = require('./util');

const { APP_NAME: appName = 'Lightkeeper' } = process.env;

// stores the app logger
let logger;

/**
 * Starts a new session
 * @param {object} context The github context
 * @param {config} config A pre-processed config
 * @param {mixed} params A validator function or boolean
 * @param {object} macros An optional macro config
 */
async function run(...args) {
  // starts a new session, so multiple webhooks can run in parallel
  const session = new Session(appName, logger);
  await session.start(...args);
}

/**
 * Runs when a check is finished
 * @param {object} context The webhook payload
 */
async function onCompletedCheck(context) {
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

  await run(
    context,
    null,
    { pullNumber, headBranch, headSha, installationNode },
    isValidCheck([name, checkAppName, login], 'check')
  );
}

/**
 * Runs when a check is re-requested
 * @param {object} The github context
 */
async function onRequestedCheck(context) {
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
  await run(context, null, { pullNumber, headBranch, headSha, installationNode, checkRun }, true);
}

/**
 * Runs tests when a Pull Request deployment is succesful
 * @param {object} context The github context
 */
async function onDeployment(context) {
  const {
    deployment_status: {
      id: status_id,
      state,
      creator: { login },
      target_url,
      environment
    },
    deployment: { id: deployment_id, sha: headSha },
    installation: { node_id: installationNode }
  } = context.payload;

  // skip for started or failed statuses
  if (state !== 'success' || !headSha || environment !== 'staging') return;

  const pullNumber = await getPullRequestNumber(context, headSha);

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

  // retrieve the `environment_url`
  // TODO: Switch to `repos.getDeploymentStatus` when correct header is added
  const {
    data: { environment_url }
  } = await context.github.request(
    'GET /repos/:owner/:repo/deployments/:deployment_id/statuses/:status_id ',
    context.repo({
      deployment_id,
      status_id,
      headers: {
        accept: 'application/vnd.github.ant-man-preview+json'
      }
    })
  );

  await run(
    context,
    null,
    { pullNumber, headBranch, headSha, installationNode },
    isValidCheck([login], 'deployment'),
    {
      '{target_url}': target_url,
      '{environment_url}': environment_url
    }
  );
}

/**
 * Runs when a status is posted
 * @param {object} context The github context
 */
async function onStatus(context) {
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

  const pullNumber = await getPullRequestNumber(context, headSha);

  if (!pullNumber) return;

  await run(
    context,
    null,
    { pullNumber, headBranch, headSha, installationNode },
    isValidCheck([name, login], 'status'),
    { '{target_url}': target_url }
  );
}

function Lightkeeper(app) {
  // bind events once to the app
  if (app.runLightkeeper) return run;
  app.runLightkeeper = run;
  logger = app.log.child({ name: appName });
  // start listening for events
  app.on('check_run.completed', onCompletedCheck);
  app.on('check_run.rerequested', onRequestedCheck);
  app.on('deployment_status', onDeployment);
  app.on('status', onStatus);
}

module.exports = Lightkeeper;
