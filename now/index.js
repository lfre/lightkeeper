const { createProbot } = require('probot');
const auth = require('./util/auth');

const { APP_ID: appId, PRIVATE_KEY: privateKey, WEBHOOK_SECRET: secret } = process.env;

const buffer = Buffer.from(privateKey, 'base64');
const cert = buffer.toString('ascii');
const appSource = require('..');

const serverless = appFunc => {
  const probot = createProbot({ id: appId, cert, secret });
  const probotApp = probot.load(appFunc);

  return async (req, res) => {
    // attempt to read body params
    const { pr, config, macros = {}, repo: { name, owner: login } = {} } = req.body || {};
    // If this is a manual request, authenticate
    if (pr && name && login) {
      const { runLightkeeper } = probotApp;
      const pullNumber = +pr;
      const { context, headBranch, headSha } = await auth(
        probotApp,
        pullNumber,
        { login, name },
        res
      );
      if (!context) return false;
      try {
        await runLightkeeper(context, config, { pullNumber, headBranch, headSha }, true, macros);
        return res.status(200).send('Process ran succesfully');
      } catch (error) {
        return res.status(400).send({
          message: 'An error was found processing the request',
          error
        });
      }
    }
    // process as github webhook reponse
    return probot.server(req, res);
  };
};

module.exports = serverless(appSource);
