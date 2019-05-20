const { serverless } = require('@chadfawcett/probot-serverless-now')
const app = require('./')
module.exports = serverless(app)
