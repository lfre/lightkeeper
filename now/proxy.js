const { createWebhookProxy } = require('probot/lib/webhook-proxy')
const { logger } = require('probot/lib/logger')
const { config } = require('dotenv');

// read .env
config();

const {
  PORT: port = 3000,
  WEBHOOK_PATH: path = '/',
  WEBHOOK_PROXY_URL: url
} = process.env;

// start proxy
createWebhookProxy({
  logger,
  path,
  port,
  url
});
