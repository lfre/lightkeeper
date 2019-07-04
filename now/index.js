const { createProbot } = require('probot');

const { APP_ID: id, PRIVATE_KEY: privateKey, WEBHOOK_SECRET: secret } = process.env;

const buffer = Buffer.from(privateKey, 'base64');
const cert = buffer.toString('ascii');
const lightkeeper = require('..');

const serverless = app => {
  const probot = createProbot({ id, cert, secret });
  probot.load(app);
  return probot.server;
};

module.exports = serverless(lightkeeper);
