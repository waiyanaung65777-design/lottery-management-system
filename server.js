const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB, run, get, all } = require('./db');
const { parseBets } = require('./parser');
const { loginUser, createAgentAccount, isSupabaseConfigured } = require('./auth');
const { getBangkokNow, getBangkokDateStr, formatBangkokDateTime, checkSessionBettingAllowed } = require('./timeUtils');

const app = express();
const PORT = process.env.PORT || 3000;

const sendFileOptions = { dotfiles: 'allow' };

app.use(cors());
app.use(express.json());
// Ensure DB is initialized before any request (important on Vercel serverless)
let dbReady = false;
app.use(async (req, res, next) => {
  if (!dbReady) {
    try {
      await initDB();
      dbReady = true;
    } catch (e) {
      console.error('DB ready error:', e);
    }
  }
  next();
});
// Allow dotfiles because project path contains '.gemini'
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'allow' }));

// ----------------------
// Dedicated Page Routing
// ----------------------
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'), sendFileOptions);
});

app.get('/banker', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'banker.html'), sendFileOptions);
});

app.get('/agent', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agent.html'), sendFileOptions);
});

// Root route: Redirect to /login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// ----------------------
// Auth API
// ----------------------
app.get('/api/auth/status', (req, res) => {
  res.json({
    success: true,
    supabaseConfigured: isSupabaseConfigured,
    message: isSupabaseConfigured
      ? 'Supabase Cloud Auth Active ⚡'
      : 'Local Auth Active (Ready for Supabase credentials)'
  });
});

// Bangkok Time API (Real Time in Asia/Bangkok, UTC+7)
app.get('/api/time', (req, res) => {
  const bkk = getBangkokNow();
  res.json({
    success: true,
    timezone: 'Asia/Bangkok',
    iso: bkk.toISOString(),
    date_str: getBangkokDateStr(bkk),
    time_str: bkk.toLocaleTimeString('en-US', { hour12: true }),
    formatted: formatBangkokDateTime(bkk),
    timestamp: bkk.getTime()
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername) {
      return res.status(400).json({ success: false, error: 'Email သို့မဟုတ် Username ထည့်သွင်းပေးပါ' });
    }

    const authResult = await loginUser(emailOrUsername, password || '');
    res.json({
      success: true,
      data: authResult
    });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// ----------------------
// Users & Agents API
// ----------------------
app.get('/api/users', async (req, res) => {
  try {
    const users = await all(`SELECT id, username, email, password, name, role, commission_rate, payout_multiplier_2d, payout_multiplier_3d, credit_limit, status FROM users`);
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, email, password, name, commission_rate = 15.0, credit_limit = 1000000 } = req.body;
    const finalEmail = email || (username ? (username.includes('@') ? username : `${username}@2d.com`) : '');
    const finalPassword = password || 'Asdf1234!@#$';

    if (!name || !finalEmail) {
      return res.status(400).json({ success: false, error: 'အေးဂျင့် အမည် နှင့် Email ထည့်သွင်းပေးပါ' });
    }

    const created = await createAgentAccount({
      name,
      email: finalEmail,
      password: finalPassword,
      commission_rate,
      credit_limit
    });

    res.json({
      success: true,
      data: created,
      message: `ကော်မရှင် အေးဂျင့် (${name}) အကောင့် ဖွင့်ပေးပြီးပါပြီ!`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { name, commission_rate, credit_limit, status } = req.body;
    await run(
      `UPDATE users SET name = COALESCE(?, name), commission_rate = COALESCE(?, commission_rate), credit_limit = COALESCE(?, credit_limit), status = COALESCE(?, status) WHERE id = ?`,
      [name, commission_rate, credit_limit, status, req.params.id]
    );
    res.json({ success: true, message: 'Updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------
// Sessions API
// ----------------------
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await all(`SELECT * FROM sessions ORDER BY id DESC`);
    const now = getBangkokNow();
    const enhanced = sessions.map(s => {
      const check = checkSessionBettingAllowed(s, now);
      return {
        ...s,
        can_bet: check.canBet,
        remaining_seconds: check.remainingSeconds,
        cutoff_time: check.cutoffTime || (s.session_name.includes('12:00') ? '12:00 PM' : '04:00 PM'),
        result_time: check.resultTime || (s.session_name.includes('12:30') ? '12:30 PM' : '04:30 PM'),
        reason: check.reason || null
      };
    });
    res.json({
      success: true,
      data: enhanced,
      bangkok_time: now.toISOString(),
      bangkok_time_formatted: formatBangkokDateTime(now)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { lottery_type, session_name, payout_multiplier } = req.body;
    const defaultMult = lottery_type === '3D' ? 600.0 : 85.0;
    const mult = payout_multiplier || defaultMult;

    const result = await run(
      `INSERT INTO sessions (lottery_type, session_name, payout_multiplier) VALUES (?, ?, ?)`,
      [lottery_type, session_name, mult]
    );
    res.json({ success: true, id: result.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Settle session with winning number
app.post('/api/sessions/:id/settle', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { winning_number } = req.body;

    if (!winning_number) {
      return res.status(400).json({ success: false, error: 'ပေါက်ဂဏန်း ထည့်သွင်းပေးပါ' });
    }

    const session = await get(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const mult = session.payout_multiplier;

    // 1. Mark session as settled
    await run(
      `UPDATE sessions SET status = 'settled', winning_number = ?, settled_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [winning_number.trim(), sessionId]
    );

    // 2. Reset winning flags for this session items first
    await run(`
      UPDATE slip_items 
      SET is_winner = 0, win_amount = 0 
      WHERE slip_id IN (SELECT id FROM slips WHERE session_id = ?)
    `, [sessionId]);

    // 3. Mark matching items as winners
    await run(`
      UPDATE slip_items 
      SET is_winner = 1, win_amount = amount * ? 
      WHERE slip_id IN (SELECT id FROM slips WHERE session_id = ?) 
      AND number = ?
    `, [mult, sessionId, winning_number.trim()]);

    // 4. Summarize winning stats
    const winStats = await get(`
      SELECT COUNT(*) as win_count, COALESCE(SUM(win_amount), 0) as total_win_payout 
      FROM slip_items 
      WHERE slip_id IN (SELECT id FROM slips WHERE session_id = ?) 
      AND is_winner = 1
    `, [sessionId]);

    res.json({
      success: true,
      winning_number,
      win_count: winStats.win_count,
      total_win_payout: winStats.total_win_payout,
      message: `ပေါက်ဂဏန်း ${winning_number} ဖြင့် စာရင်းရှင်းပြီးပါပြီ!`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------
// Number Limits & Hot Numbers API
// ----------------------
app.get('/api/limits', async (req, res) => {
  try {
    const limits = await all(`SELECT * FROM number_limits ORDER BY id DESC`);
    res.json({ success: true, data: limits });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/limits', async (req, res) => {
  try {
    const { lottery_type = '2D', number, max_amount } = req.body;
    if (!number || max_amount === undefined) {
      return res.status(400).json({ success: false, error: 'Number and max amount are required' });
    }
    const result = await run(
      `INSERT INTO number_limits (lottery_type, number, max_amount) VALUES (?, ?, ?)`,
      [lottery_type, number.trim(), max_amount]
    );
    res.json({ success: true, id: result.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/limits/:id', async (req, res) => {
  try {
    await run(`DELETE FROM number_limits WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------
// Smart Parser & Validation API
// ----------------------
app.post('/api/parse', async (req, res) => {
  try {
    const { text, lottery_type = '2D', session_id } = req.body;
    const parsed = parseBets(text, lottery_type);

    // Check existing bets against limits if session is provided
    const limits = await all(
      `SELECT number, max_amount FROM number_limits WHERE lottery_type = ?`,
      [lottery_type]
    );
    const limitMap = new Map();
    limits.forEach(l => limitMap.set(l.number, l.max_amount));

    // Get current total bet on each number for this session
    const currentBets = session_id ? await all(`
      SELECT si.number, SUM(si.amount) as current_total 
      FROM slip_items si 
      JOIN slips s ON s.id = si.slip_id 
      WHERE s.session_id = ? 
      GROUP BY si.number
    `, [session_id]) : [];

    const currentMap = new Map();
    currentBets.forEach(b => currentMap.set(b.number, b.current_total));

    // Add warnings if any number breaches limit
    const itemsWithStatus = parsed.items.map(item => {
      const maxLimit = limitMap.get(item.number);
      const currentPlaced = currentMap.get(item.number) || 0;
      let isBlocked = false;
      let warning = null;

      if (maxLimit !== undefined) {
        if (maxLimit === 0) {
          isBlocked = true;
          warning = `ဂဏန်း ${item.number} သည် ဒိုင်ပိတ်ထားသော ဂဏန်းဖြစ်ပါသည်!`;
        } else if (currentPlaced + item.amount > maxLimit) {
          warning = `ဂဏန်း ${item.number} ၏ Limit (${maxLimit.toLocaleString()} ကျပ်) ပြည့်လုနီးပါး သို့မဟုတ် ကျော်လွန်နေပါသည်! (လက်ရှိတင်ထားပြီး: ${currentPlaced.toLocaleString()})`;
        }
      }

      return {
        ...item,
        isBlocked,
        warning
      };
    });

    res.json({
      success: true,
      items: itemsWithStatus,
      totalAmount: parsed.totalAmount,
      errors: parsed.errors,
      itemCount: parsed.items.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------
// Slips & Bets API
// ----------------------
app.post('/api/slips', async (req, res) => {
  try {
    const { agent_id, session_id, customer_name, raw_text, lottery_type = '2D', items } = req.body;

    if (!agent_id || !session_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'လိုအပ်သော အချက်အလက်များ မပြည့်စုံပါ' });
    }

    // Strict Bangkok Cutoff Enforcement (12:00 PM / 04:00 PM)
    const session = await get(`SELECT * FROM sessions WHERE id = ?`, [session_id]);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const timeCheck = checkSessionBettingAllowed(session);
    if (!timeCheck.canBet) {
      return res.status(400).json({
        success: false,
        error: `🛑 အထိုးပိတ်သွားပါပြီ! ${timeCheck.reason}`
      });
    }

    // Get Agent commission rate
    const agent = await get(`SELECT * FROM users WHERE id = ?`, [agent_id]);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

    const totalAmount = items.reduce((sum, i) => sum + Number(i.amount), 0);
    const commRate = agent.commission_rate || 0;
    const commAmount = (totalAmount * commRate) / 100.0;
    const netToBanker = totalAmount - commAmount;

    // Check blocked numbers
    const limits = await all(`SELECT number, max_amount FROM number_limits WHERE lottery_type = ?`, [lottery_type]);
    const blocked = limits.filter(l => l.max_amount === 0).map(l => l.number);

    for (const it of items) {
      if (blocked.includes(it.number)) {
        return res.status(400).json({
          success: false,
          error: `ဂဏန်း [${it.number}] သည် ဒိုင်ပိတ်ထားသောကြောင့် လက်မခံပါ`
        });
      }
    }

    // Insert slip
    const slipResult = await run(`
      INSERT INTO slips (agent_id, session_id, customer_name, raw_text, lottery_type, total_amount, commission_rate, commission_amount, net_to_banker)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [agent_id, session_id, customer_name || 'အမည်မဖော်လိုသူ', raw_text || '', lottery_type, totalAmount, commRate, commAmount, netToBanker]);

    const slipId = slipResult.id;

    // Insert slip items
    for (const it of items) {
      await run(`
        INSERT INTO slip_items (slip_id, number, amount) VALUES (?, ?, ?)
      `, [slipId, it.number, it.amount]);
    }

    res.json({
      success: true,
      slipId,
      totalAmount,
      commissionAmount: commAmount,
      netToBanker,
      itemCount: items.length,
      message: 'ဒိုင်ဆီသို့ စလစ် အောင်မြင်စွာ တင်ပြီးပါပြီ!'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/slips', async (req, res) => {
  try {
    const { agent_id, session_id, period, date } = req.query;
    let query = `
      SELECT s.*, u.name as agent_name, ses.session_name, ses.winning_number, ses.status as session_status,
      (SELECT COUNT(*) FROM slip_items WHERE slip_id = s.id AND is_winner = 1) as winner_count,
      (SELECT COALESCE(SUM(win_amount), 0) FROM slip_items WHERE slip_id = s.id) as total_win_amount
      FROM slips s
      JOIN users u ON u.id = s.agent_id
      JOIN sessions ses ON ses.id = s.session_id
      WHERE 1=1
    `;
    const params = [];
    if (agent_id) {
      query += ` AND s.agent_id = ?`;
      params.push(agent_id);
    }
    if (session_id) {
      query += ` AND s.session_id = ?`;
      params.push(session_id);
    }
    query += ` ORDER BY s.id DESC LIMIT 300`;

    let slips = await all(query, params);

    // Apply Bangkok Time Date Filtering (Preserving 7-day history)
    const todayStr = getBangkokDateStr();
    const yesterdayDate = new Date(getBangkokNow());
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = getBangkokDateStr(yesterdayDate);

    const weekAgoDate = new Date(getBangkokNow());
    weekAgoDate.setDate(weekAgoDate.getDate() - 7);
    const weekAgoStr = getBangkokDateStr(weekAgoDate);

    if (period === 'today') {
      slips = slips.filter(s => (s.created_at || '').startsWith(todayStr));
    } else if (period === 'yesterday') {
      slips = slips.filter(s => (s.created_at || '').startsWith(yesterdayStr));
    } else if (period === 'week' || period === '7days') {
      slips = slips.filter(s => {
        const slipDate = (s.created_at || '').substring(0, 10);
        return slipDate >= weekAgoStr;
      });
    } else if (date) {
      slips = slips.filter(s => (s.created_at || '').startsWith(date));
    }

    res.json({
      success: true,
      data: slips,
      total_count: slips.length,
      current_bangkok_date: todayStr
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/slips/:id', async (req, res) => {
  try {
    const slip = await get(`
      SELECT s.*, u.name as agent_name, ses.session_name, ses.winning_number, ses.status as session_status 
      FROM slips s 
      JOIN users u ON u.id = s.agent_id 
      JOIN sessions ses ON ses.id = s.session_id 
      WHERE s.id = ?
    `, [req.params.id]);

    if (!slip) return res.status(404).json({ success: false, error: 'Slip not found' });

    const items = await all(`SELECT * FROM slip_items WHERE slip_id = ? ORDER BY id ASC`, [req.params.id]);
    res.json({ success: true, data: { ...slip, items } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------
// Master Statistics & Risk Dashboard
// ----------------------
app.get('/api/stats/banker', async (req, res) => {
  try {
    const { session_id } = req.query;
    let whereClause = session_id ? `WHERE s.session_id = ${parseInt(session_id, 10)}` : '';

    const summary = await get(`
      SELECT 
        COUNT(DISTINCT s.id) as total_slips,
        COALESCE(SUM(s.total_amount), 0) as total_bet_amount,
        COALESCE(SUM(s.commission_amount), 0) as total_commission,
        COALESCE(SUM(s.net_to_banker), 0) as total_net_sales
      FROM slips s
      ${whereClause}
    `);

    // Calculate total winnings paid out
    let winClause = session_id ? `WHERE s.session_id = ${parseInt(session_id, 10)}` : '';
    const winSummary = await get(`
      SELECT COALESCE(SUM(si.win_amount), 0) as total_payout
      FROM slip_items si
      JOIN slips s ON s.id = si.slip_id
      ${winClause} AND si.is_winner = 1
    `);

    const totalSales = summary.total_net_sales || 0;
    const totalPayout = winSummary.total_payout || 0;
    const netProfit = totalSales - totalPayout;

    // Number-wise Risk Heatmap
    let numClause = session_id ? `WHERE s.session_id = ${parseInt(session_id, 10)}` : '';
    const numberBreakdown = await all(`
      SELECT si.number, SUM(si.amount) as total_amount, COUNT(si.id) as bet_count
      FROM slip_items si
      JOIN slips s ON s.id = si.slip_id
      ${numClause}
      GROUP BY si.number
      ORDER BY total_amount DESC
      LIMIT 20
    `);

    // Agent-wise breakdown
    const agentBreakdown = await all(`
      SELECT u.id, u.name, u.commission_rate,
        COUNT(s.id) as slips_count,
        COALESCE(SUM(s.total_amount), 0) as total_amount,
        COALESCE(SUM(s.commission_amount), 0) as commission_amount,
        COALESCE(SUM(s.net_to_banker), 0) as net_to_banker,
        (
          SELECT COALESCE(SUM(si2.win_amount), 0) 
          FROM slip_items si2 
          JOIN slips s2 ON s2.id = si2.slip_id 
          WHERE s2.agent_id = u.id AND si2.is_winner = 1
          ${session_id ? `AND s2.session_id = ${parseInt(session_id, 10)}` : ''}
        ) as total_agent_payout
      FROM users u
      LEFT JOIN slips s ON s.agent_id = u.id ${session_id ? `AND s.session_id = ${parseInt(session_id, 10)}` : ''}
      WHERE u.role = 'agent'
      GROUP BY u.id
    `);

    res.json({
      success: true,
      summary: {
        total_slips: summary.total_slips,
        total_bet_amount: summary.total_bet_amount,
        total_commission: summary.total_commission,
        total_net_sales: summary.total_net_sales,
        total_payout: totalPayout,
        net_profit: netProfit
      },
      numberBreakdown,
      agentBreakdown
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Server
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🎯 2D/3D Lottery System is running!`);
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`🔑 Login Page: http://localhost:${PORT}/login`);
    console.log(`👑 Banker URL: http://localhost:${PORT}/banker`);
    console.log(`👤 Agent URL:  http://localhost:${PORT}/agent`);
    console.log(`===============================================`);
  });
}

if (require.main === module || !process.env.VERCEL) {
  start();
}

module.exports = app;
