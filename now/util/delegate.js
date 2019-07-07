const https = require('https');

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
    req.on('error', reject);
    req.write(data);
    req.end(resolve);
  });
};
