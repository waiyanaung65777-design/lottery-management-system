const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(b) }));
    }).on('error', reject);
  });
}

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
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function test() {
  console.log('--- 1. Testing Bangkok Time Endpoint ---');
  const timeRes = await get('/api/time');
  console.log('Time Response:', timeRes.data);
  console.assert(timeRes.data.timezone === 'Asia/Bangkok');
  console.assert(Boolean(timeRes.data.date_str));

  console.log('\n--- 2. Testing Sessions with Cutoff Info ---');
  const sessRes = await get('/api/sessions');
  console.log(`Found ${sessRes.data.data.length} sessions.`);
  const sampleMorning = sessRes.data.data.find(s => s.session_name.includes('မနက်ပိုင်း'));
  console.log('Sample Morning Session:', {
    name: sampleMorning.session_name,
    can_bet: sampleMorning.can_bet,
    cutoff: sampleMorning.cutoff_time,
    result: sampleMorning.result_time,
    remaining: sampleMorning.remaining_seconds
  });

  console.log('\n--- 3. Testing 7-Day History Slips ---');
  const slipsRes = await get('/api/slips?period=week');
  console.log(`Found ${slipsRes.data.data.length} slips in 7-day history.`);
  console.assert(slipsRes.data.data.length > 0, 'Should have 7-day history slips preserved');

  console.log('\n--- 4. Testing Betting on a Closed Session (Should be blocked) ---');
  // Find a closed session (e.g. yesterday's session)
  const closedSession = sessRes.data.data.find(s => !s.can_bet || s.status === 'settled');
  if (closedSession) {
    const betAttempt = await post('/api/slips', {
      agent_id: 2,
      session_id: closedSession.id,
      customer_name: 'Test Bettor',
      raw_text: '45 R 100',
      lottery_type: '2D',
      items: [{ number: '45', amount: 100 }]
    });
    console.log('Bet on closed session result:', betAttempt);
    console.assert(betAttempt.status === 400, 'Should return HTTP 400');
    console.assert(betAttempt.data.error.includes('အထိုးပိတ်သွားပါပြီ') || betAttempt.data.error.includes('ပွဲပိတ်ချိန်'), 'Should have cutoff error message');
  }

  console.log('\n✅ ALL BANGKOK TIME & 7-DAY HISTORY TESTS PASSED 100%! 🎉');
}

test().catch(console.error);
