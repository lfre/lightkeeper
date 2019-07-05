const delegate = require('./util/delegate');

module.exports = async (req, res) => {
  const host = req.headers['x-now-deployment-url'];
  await delegate(host, req.body);
  res.status(200).send('The request has been sent to Lightkeeper.');
};
