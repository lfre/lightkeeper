const https = require('https');

const { error } = console;

module.exports = async (host, body = {}) => {
  const data = JSON.stringify(body);
  const options = {
    hostname: host,
    method: 'POST',
    path: '/',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };
  await new Promise((resolve, reject) => {
    const req = https.request(options);
    req.on('error', e => {
      error(`There was a problem with the request: ${e.message}`);
      reject(e);
    });
    req.write(data);
    req.end(resolve);
  });
};
