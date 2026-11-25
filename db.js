const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'lottery.db');
const db = new sqlite3.Database(dbPath);

// Helper promise wrapper for queries
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDB() {
  await run(`PRAGMA foreign_keys = ON;`);

  // Users table
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

  // Sessions table (2D rounds or 3D dates)
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

  // Number Limits table (Hot numbers / Blocked numbers)
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

  // Slips table
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

  // Slip items table
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

  // Seed default data if empty
  const userCount = await get(`SELECT COUNT(*) as count FROM users;`);
  if (userCount.count === 0) {
    console.log('Seeding initial default users and sessions...');

    // 1 Banker
    await run(`
      INSERT INTO users (username, name, role, commission_rate, payout_multiplier_2d, payout_multiplier_3d)
      VALUES ('admin', 'ဒိုင်ချုပ်ကြီး (Master)', 'banker', 0, 85, 600);
    `);

    // 2 Agents
    await run(`
      INSERT INTO users (username, name, role, commission_rate)
      VALUES 
      ('agent1', 'ကိုအောင် (Agent 1)', 'agent', 15.0),
      ('agent2', 'ကိုကျော် (Agent 2)', 'agent', 12.0);
    `);

    // Active 2D Session (Today 12:01 PM)
    await run(`
      INSERT INTO sessions (lottery_type, session_name, status, payout_multiplier)
      VALUES ('2D', 'ယနေ့ 2D (12:01 PM)', 'open', 85.0);
    `);

    // Active 2D Session (Today 04:30 PM)
    await run(`
      INSERT INTO sessions (lottery_type, session_name, status, payout_multiplier)
      VALUES ('2D', 'ယနေ့ 2D (04:30 PM)', 'open', 85.0);
    `);

    // Active 3D Session
    await run(`
      INSERT INTO sessions (lottery_type, session_name, status, payout_multiplier)
      VALUES ('3D', '3D ပွဲစဉ် (၁၆ ရက်နေ့)', 'open', 600.0);
    `);

    // Add sample hot number limit: 95 limit to 50,000 Ks
    await run(`
      INSERT INTO number_limits (lottery_type, number, max_amount)
      VALUES ('2D', '95', 50000);
    `);

    console.log('Database seeded successfully.');
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDB
};
