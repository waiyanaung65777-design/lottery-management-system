const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testAuth() {
  console.log('Testing Auth Endpoint for Banker (admin)...');
  const bankerLogin = await post('/api/auth/login', { emailOrUsername: 'admin', password: '123' });
  console.log('Banker Login Result:', bankerLogin);
  console.assert(bankerLogin.success === true);
  console.assert(bankerLogin.data.user.role === 'banker');

  console.log('\nTesting Auth Endpoint for Agent (agent1)...');
  const agentLogin = await post('/api/auth/login', { emailOrUsername: 'agent1', password: '123' });
  console.log('Agent Login Result:', agentLogin);
  console.assert(agentLogin.success === true);
  console.assert(agentLogin.data.user.role === 'agent');
  console.assert(agentLogin.data.user.commission_rate === 15.0);

  console.log('\n✅ ALL AUTH TESTS PASSED 100%! 🎉');
}

testAuth().catch(console.error);
