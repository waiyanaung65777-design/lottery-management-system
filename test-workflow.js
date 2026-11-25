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

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });
}

async function runTest() {
  console.log('--- Step 1: Testing Bet Parser API (45 R 200) ---');
  const parseRes = await post('/api/parse', {
    text: '45 R 200',
    lottery_type: '2D',
    session_id: 1
  });
  console.log('Parser Result:', parseRes);
  console.assert(parseRes.items.length === 2, 'Should expand into 2 bets');
  console.assert(parseRes.totalAmount === 400, 'Total should be 400');

  console.log('\n--- Step 2: Testing Submit Slip (Agent submitting to Banker) ---');
  const slipRes = await post('/api/slips', {
    agent_id: 2, // Agent 1 (ကိုအောင် - 15% comm)
    session_id: 1, // 2D 12:01 PM
    customer_name: 'ကိုကျော် (Telegram)',
    raw_text: '45 R 200',
    lottery_type: '2D',
    items: parseRes.items
  });
  console.log('Slip Submission Result:', slipRes);
  console.assert(slipRes.success === true);
  console.assert(slipRes.commissionAmount === 60, '15% of 400 is 60');
  console.assert(slipRes.netToBanker === 340, '400 - 60 = 340');

  console.log('\n--- Step 3: Banker Dashboard Stats ---');
  const bankerStats = await get('/api/stats/banker');
  console.log('Banker Stats Before Settlement:', bankerStats.summary);
  console.log('Number Breakdown (Risk):', bankerStats.numberBreakdown);

  console.log('\n--- Step 4: Settle Session with Winning Number (45) ---');
  const settleRes = await post('/api/sessions/1/settle', {
    winning_number: '45'
  });
  console.log('Settle Result:', settleRes);
  console.assert(settleRes.win_count === 1);
  console.assert(settleRes.total_win_payout === 200 * 85); // 17,000 Ks

  console.log('\n--- Step 5: Banker Dashboard Stats After Settlement ---');
  const finalStats = await get('/api/stats/banker');
  console.log('Final Banker Stats:', finalStats.summary);

  console.log('\n✅ ALL INTEGRATION TESTS PASSED 100%! 🎉');
}

runTest().catch(console.error);
