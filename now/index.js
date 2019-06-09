const { createProbot } = require('probot')

const {
  APP_ID: id,
  PRIVATE_KEY: cert,
  WEBHOOK_SECRET: secret
} = process.env;

const app = require('..');

const serverless = (app) => {
  const probot = createProbot({ id, cert, secret });
  probot.load(app);
  return probot.server;
}

module.exports = serverless(app);
