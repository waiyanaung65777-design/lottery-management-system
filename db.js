const path = require('path');
const fs = require('fs');

let sqlite3 = null;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.warn('⚠️ Native sqlite3 not available in this environment. Falling back to in-memory store.');
}

// On Vercel, the filesystem is read-only except /tmp
const dbPath = process.env.VERCEL
  ? path.join('/tmp', 'lottery.db')
  : path.resolve(__dirname, 'lottery.db');

let db = null;
let useInMemory = false;

if (sqlite3) {
  try {
    db = new sqlite3.Database(dbPath);
  } catch (err) {
    console.warn('⚠️ Could not open SQLite database file, using in-memory mode:', err.message);
    useInMemory = true;
  }
} else {
  useInMemory = true;
}

// In-Memory Data Store Fallback for serverless environments where native sqlite3 binaries fail
const memoryStore = {
  users: [
    { id: 1, username: 'admin', name: 'ဒိုင်ချုပ်ကြီး (Master)', role: 'banker', commission_rate: 0, payout_multiplier_2d: 85, payout_multiplier_3d: 600, credit_limit: 1000000, status: 'active' },
    { id: 2, username: 'agent1', name: 'ကိုအောင် (Agent 1)', role: 'agent', commission_rate: 15.0, payout_multiplier_2d: 85, payout_multiplier_3d: 600, credit_limit: 1000000, status: 'active' },
    { id: 3, username: 'agent2', name: 'ကိုကျော် (Agent 2)', role: 'agent', commission_rate: 12.0, payout_multiplier_2d: 85, payout_multiplier_3d: 600, credit_limit: 1000000, status: 'active' }
  ],
  sessions: [
    { id: 1, lottery_type: '2D', session_name: 'ယနေ့ 2D (12:01 PM)', status: 'open', winning_number: null, payout_multiplier: 85.0 },
    { id: 2, lottery_type: '2D', session_name: 'ယနေ့ 2D (04:30 PM)', status: 'open', winning_number: null, payout_multiplier: 85.0 },
    { id: 3, lottery_type: '3D', session_name: '3D ပွဲစဉ် (၁၆ ရက်နေ့)', status: 'open', winning_number: null, payout_multiplier: 600.0 }
  ],
  number_limits: [
    { id: 1, session_id: null, lottery_type: '2D', number: '95', max_amount: 50000 }
  ],
  slips: [],
  slip_items: []
};

function run(sql, params = []) {
  if (useInMemory || !db) {
    return runMemory(sql, params);
  }
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  if (useInMemory || !db) {
    return getMemory(sql, params);
  }
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  if (useInMemory || !db) {
    return allMemory(sql, params);
  }
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// In-Memory Query Handlers
function runMemory(sql, params) {
  const cleanSql = sql.trim().toUpperCase();
  if (cleanSql.startsWith('INSERT INTO USERS')) {
    const id = memoryStore.users.length + 1;
    memoryStore.users.push({
      id,
      username: params[0],
      name: params[1],
      role: params[2] || 'agent',
      commission_rate: params[3] || 15.0,
      credit_limit: params[4] || 1000000,
      status: 'active'
    });
    return Promise.resolve({ id });
  }

  if (cleanSql.startsWith('INSERT INTO NUMBER_LIMITS')) {
    const id = memoryStore.number_limits.length + 1;
    memoryStore.number_limits.push({
      id,
      lottery_type: params[0],
      number: params[1],
      max_amount: params[2]
    });
    return Promise.resolve({ id });
  }

  if (cleanSql.startsWith('DELETE FROM NUMBER_LIMITS')) {
    const id = parseInt(params[0], 10);
    memoryStore.number_limits = memoryStore.number_limits.filter(l => l.id !== id);
    return Promise.resolve({ changes: 1 });
  }

  if (cleanSql.startsWith('INSERT INTO SLIPS')) {
    const id = memoryStore.slips.length + 1;
    const slip = {
      id,
      agent_id: params[0],
      session_id: params[1],
      customer_name: params[2],
      raw_text: params[3],
      lottery_type: params[4],
      total_amount: params[5],
      commission_rate: params[6],
      commission_amount: params[7],
      net_to_banker: params[8],
      status: 'confirmed',
      created_at: new Date().toISOString()
    };
    memoryStore.slips.push(slip);
    return Promise.resolve({ id });
  }

  if (cleanSql.startsWith('INSERT INTO SLIP_ITEMS')) {
    const id = memoryStore.slip_items.length + 1;
    memoryStore.slip_items.push({
      id,
      slip_id: params[0],
      number: params[1],
      amount: params[2],
      is_winner: 0,
      win_amount: 0
    });
    return Promise.resolve({ id });
  }

  if (cleanSql.includes('UPDATE SESSIONS SET STATUS = \'SETTLED\'')) {
    const winningNum = params[0];
    const sessId = parseInt(params[1], 10);
    const session = memoryStore.sessions.find(s => s.id === sessId);
    if (session) {
      session.status = 'settled';
      session.winning_number = winningNum;
    }
    return Promise.resolve({ changes: 1 });
  }

  if (cleanSql.includes('UPDATE SLIP_ITEMS') && cleanSql.includes('IS_WINNER = 1')) {
    const mult = params[0];
    const sessId = parseInt(params[1], 10);
    const winningNum = params[2];
    const slipIds = memoryStore.slips.filter(s => s.session_id == sessId).map(s => s.id);

    memoryStore.slip_items.forEach(item => {
      if (slipIds.includes(item.slip_id) && item.number === winningNum) {
        item.is_winner = 1;
        item.win_amount = item.amount * mult;
      }
    });
    return Promise.resolve({ changes: 1 });
  }

  return Promise.resolve({ id: 1, changes: 1 });
}

function getMemory(sql, params) {
  const cleanSql = sql.trim().toUpperCase();

  if (cleanSql.includes('FROM USERS WHERE USERNAME = ?')) {
    const uname = params[0];
    const user = memoryStore.users.find(u => u.username === uname || u.username === uname.split('@')[0]);
    return Promise.resolve(user || null);
  }

  if (cleanSql.includes('FROM USERS WHERE ID = ?')) {
    const id = parseInt(params[0], 10);
    const user = memoryStore.users.find(u => u.id === id);
    return Promise.resolve(user || null);
  }

  if (cleanSql.includes('FROM SESSIONS WHERE ID = ?')) {
    const id = parseInt(params[0], 10);
    const session = memoryStore.sessions.find(s => s.id === id);
    return Promise.resolve(session || null);
  }

  if (cleanSql.includes('COUNT(*) AS WIN_COUNT')) {
    const sessId = parseInt(params[0], 10);
    const slipIds = memoryStore.slips.filter(s => s.session_id == sessId).map(s => s.id);
    const winningItems = memoryStore.slip_items.filter(i => slipIds.includes(i.slip_id) && i.is_winner === 1);
    const totalWin = winningItems.reduce((sum, i) => sum + i.win_amount, 0);
    return Promise.resolve({ win_count: winningItems.length, total_win_payout: totalWin });
  }

  if (cleanSql.includes('TOTAL_BET_AMOUNT')) {
    const total_slips = memoryStore.slips.length;
    const total_bet_amount = memoryStore.slips.reduce((sum, s) => sum + s.total_amount, 0);
    const total_commission = memoryStore.slips.reduce((sum, s) => sum + s.commission_amount, 0);
    const total_net_sales = memoryStore.slips.reduce((sum, s) => sum + s.net_to_banker, 0);
    return Promise.resolve({ total_slips, total_bet_amount, total_commission, total_net_sales });
  }

  if (cleanSql.includes('TOTAL_PAYOUT')) {
    const total_payout = memoryStore.slip_items
      .filter(i => i.is_winner === 1)
      .reduce((sum, i) => sum + i.win_amount, 0);
    return Promise.resolve({ total_payout });
  }

  if (cleanSql.includes('SELECT COUNT(*) AS COUNT FROM USERS')) {
    return Promise.resolve({ count: memoryStore.users.length });
  }

  return Promise.resolve(null);
}

function allMemory(sql, params) {
  const cleanSql = sql.trim().toUpperCase();

  if (cleanSql.includes('FROM USERS')) {
    return Promise.resolve([...memoryStore.users]);
  }

  if (cleanSql.includes('FROM SESSIONS')) {
    return Promise.resolve([...memoryStore.sessions]);
  }

  if (cleanSql.includes('FROM NUMBER_LIMITS')) {
    if (params && params[0]) {
      return Promise.resolve(memoryStore.number_limits.filter(l => l.lottery_type === params[0]));
    }
    return Promise.resolve([...memoryStore.number_limits]);
  }

  if (cleanSql.includes('FROM SLIPS')) {
    const slipsWithDetails = memoryStore.slips.map(s => {
      const user = memoryStore.users.find(u => u.id == s.agent_id);
      const session = memoryStore.sessions.find(ses => ses.id == s.session_id);
      const items = memoryStore.slip_items.filter(i => i.slip_id === s.id);
      const winItems = items.filter(i => i.is_winner === 1);
      const totalWin = winItems.reduce((sum, i) => sum + i.win_amount, 0);
      return {
        ...s,
        agent_name: user ? user.name : 'Unknown',
        session_name: session ? session.session_name : 'Unknown',
        session_status: session ? session.status : 'open',
        winning_number: session ? session.winning_number : null,
        winner_count: winItems.length,
        total_win_amount: totalWin
      };
    });
    return Promise.resolve(slipsWithDetails.reverse());
  }

  if (cleanSql.includes('FROM SLIP_ITEMS')) {
    if (cleanSql.includes('WHERE SLIP_ID = ?')) {
      const slipId = parseInt(params[0], 10);
      return Promise.resolve(memoryStore.slip_items.filter(i => i.slip_id === slipId));
    }
    return Promise.resolve([...memoryStore.slip_items]);
  }

  return Promise.resolve([]);
}

let isInitialized = false;

async function initDB() {
  if (isInitialized) return;
  isInitialized = true;

  if (useInMemory || !db) {
    console.log('✅ Serverless in-memory store initialized.');
    return;
  }

  try {
    await run(`PRAGMA foreign_keys = ON;`);

    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('banker', 'agent')),
        commission_rate REAL DEFAULT 15.0,
        payout_multiplier_2d REAL DEFAULT 85.0,
        payout_multiplier_3d REAL DEFAULT 600.0,
        credit_limit REAL DEFAULT 1000000,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lottery_type TEXT NOT NULL CHECK(lottery_type IN ('2D', '3D')),
        session_name TEXT NOT NULL,
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed', 'settled')),
        winning_number TEXT,
        payout_multiplier REAL DEFAULT 85.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        settled_at DATETIME
      );
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS number_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        lottery_type TEXT NOT NULL CHECK(lottery_type IN ('2D', '3D')),
        number TEXT NOT NULL,
        max_amount REAL NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS slips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        session_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        raw_text TEXT,
        lottery_type TEXT NOT NULL,
        total_amount REAL NOT NULL,
        commission_rate REAL NOT NULL,
        commission_amount REAL NOT NULL,
        net_to_banker REAL NOT NULL,
        status TEXT DEFAULT 'confirmed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(agent_id) REFERENCES users(id),
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS slip_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slip_id INTEGER NOT NULL,
        number TEXT NOT NULL,
        amount REAL NOT NULL,
        is_winner INTEGER DEFAULT 0,
        win_amount REAL DEFAULT 0,
        FOREIGN KEY(slip_id) REFERENCES slips(id) ON DELETE CASCADE
      );
    `);

    const userCount = await get(`SELECT COUNT(*) as count FROM users;`);
    if (!userCount || userCount.count === 0) {
      await run(`
        INSERT INTO users (username, name, role, commission_rate, payout_multiplier_2d, payout_multiplier_3d)
        VALUES ('admin', 'ဒိုင်ချုပ်ကြီး (Master)', 'banker', 0, 85, 600);
      `);

      await run(`
        INSERT INTO users (username, name, role, commission_rate)
        VALUES 
        ('agent1', 'ကိုအောင် (Agent 1)', 'agent', 15.0),
        ('agent2', 'ကိုကျော် (Agent 2)', 'agent', 12.0);
      `);

      await run(`
        INSERT INTO sessions (lottery_type, session_name, status, payout_multiplier)
        VALUES 
        ('2D', 'ယနေ့ 2D (12:01 PM)', 'open', 85.0),
        ('2D', 'ယနေ့ 2D (04:30 PM)', 'open', 85.0),
        ('3D', '3D ပွဲစဉ် (၁၆ ရက်နေ့)', 'open', 600.0);
      `);

      await run(`
        INSERT INTO number_limits (lottery_type, number, max_amount)
        VALUES ('2D', '95', 50000);
      `);
    }
  } catch (err) {
    console.warn('SQLite init warning, falling back to memory store:', err.message);
    useInMemory = true;
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDB
};
