const { homepage } = require('./package.json');
const { createProbot } = require('probot')
const { findPrivateKey } = require('probot/lib/private-key')
const { createWebhookProxy } = require('probot/lib/webhook-proxy')
const { logger } = require('probot/lib/logger')

const app = require('./')

const isDev = process.env.NODE_ENV === 'development';

const readOptions = () => {
  if (isDev) require('dotenv').config()
  const privateKey = findPrivateKey()
  return {
    cert: (privateKey && privateKey.toString()) || undefined,
    id: Number(process.env.APP_ID),
    port: Number(process.env.PORT) || 3000,
    secret: process.env.WEBHOOK_SECRET,
    webhookPath: process.env.WEBHOOK_PATH,
    webhookProxy: process.env.WEBHOOK_PROXY_URL
  }
}

const serverless = (app) => {
  const options = readOptions();
  const probot = createProbot(options);
  probot.load(app);
  if (options.webhookProxy) {
    createWebhookProxy({
      logger,
      path: options.webhookPath,
      port: options.port,
      url: options.webhookProxy
    })
  }
  probot.server.get('*', (req, res) => {
    res.redirect(homepage)
  });
  return probot.server;
}

module.exports = serverless(app);
