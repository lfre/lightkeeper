const delegate = require('./util/delegate');

const { error } = console;

module.exports = async (req, res) => {
  const host = req.headers['x-now-deployment-url'];
  try {
    await delegate(host, req.body);
    res.status(200).send({
      message: 'The request has been sent to Lightkeeper.'
    });
  } catch (err) {
    const errorText = 'There was a problem with the request';
    error(`${errorText}: ${err.message}`);
    res.status(400).send({
      message: errorText,
      error: err.message
    });
  }
};
