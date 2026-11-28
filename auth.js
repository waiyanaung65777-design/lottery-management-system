require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { get, run, all } = require('./db');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('your-project')
);

let supabase = null;
if (isSupabaseConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('✅ Connected to Supabase Auth & Database!');
  } catch (err) {
    console.warn('⚠️ Supabase initialization warning:', err.message);
  }
} else {
  console.log('ℹ️ Running in Local Auth mode (Supabase keys not set yet). Real Supabase credentials can be added in .env anytime.');
}

// Preset Accounts defined by User
const PRESET_ACCOUNTS = {
  'admin@2d.com': {
    email: 'admin@2d.com',
    username: 'admin',
    password: 'Asdf1234!@#$',
    name: 'ဒိုင်ချုပ်ကြီး (Master)',
    role: 'banker',
    commission_rate: 0
  },
  'agent@2d.com': {
    email: 'agent@2d.com',
    username: 'agent',
    password: 'Asdf1234!@#$',
    name: 'ကော်မရှင် ကိုအောင် (Agent 1)',
    role: 'agent',
    commission_rate: 15.0
  }
};

/**
 * Sign In User
 */
async function loginUser(emailOrUsername, password) {
  const input = (emailOrUsername || '').trim().toLowerCase();
  const pwd = (password || '').trim();

  // Normalize input (handle aliases like "admin" or "agent")
  let targetEmail = input;
  if (input === 'admin') targetEmail = 'admin@2d.com';
  else if (input === 'agent' || input === 'agent1') targetEmail = 'agent@2d.com';
  else if (!input.includes('@')) targetEmail = `${input}@2d.com`;

  const preset = PRESET_ACCOUNTS[targetEmail];

  // 1. If Supabase is connected
  if (isSupabaseConfigured && supabase) {
    try {
      let { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: pwd
      });

      // If user does not exist in Supabase yet, auto-provision preset account
      if (error && preset && (error.message.includes('Invalid login credentials') || error.message.includes('Email not confirmed'))) {
        if (pwd === preset.password) {
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email: preset.email,
            password: preset.password,
            options: {
              data: {
                username: preset.username,
                name: preset.name,
                role: preset.role,
                commission_rate: preset.commission_rate
              }
            }
          });

          if (!signUpErr && signUpData?.session) {
            data = signUpData;
            error = null;
          }
        }
      }

      if (!error && data?.user) {
        let profile = null;
        try {
          const profileRes = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
          profile = profileRes.data;
        } catch (e) {}

        const role = profile?.role || data.user.user_metadata?.role || (preset ? preset.role : 'agent');
        const name = profile?.name || data.user.user_metadata?.name || (preset ? preset.name : targetEmail);
        const comm = profile?.commission_rate || data.user.user_metadata?.commission_rate || (preset ? preset.commission_rate : 15.0);

        return {
          token: data.session?.access_token || `token-${data.user.id}`,
          user: {
            id: data.user.id,
            email: data.user.email,
            username: targetEmail.split('@')[0],
            name,
            role,
            commission_rate: comm
          }
        };
      }
    } catch (supaErr) {
      console.warn('Supabase signin attempt notice:', supaErr.message);
    }
  }

  // 2. Check preset accounts
  if (preset) {
    if (pwd === preset.password) {
      return {
        token: `token-${preset.username}-${Date.now()}`,
        user: {
          id: preset.role === 'banker' ? 1 : 2,
          email: preset.email,
          username: preset.username,
          name: preset.name,
          role: preset.role,
          commission_rate: preset.commission_rate
        }
      };
    } else {
      throw new Error('စကားဝှက် (Password) မှားယွင်းနေပါသည်');
    }
  }

  // 3. Check custom agents created in database
  const user = await get(
    `SELECT * FROM users WHERE email = ? OR username = ?`,
    [targetEmail, input]
  );

  if (user) {
    if (user.password && user.password !== pwd) {
      throw new Error('စကားဝှက် (Password) မှားယွင်းနေပါသည်');
    }
    return {
      token: `local-token-${user.id}-${Date.now()}`,
      user: {
        id: user.id,
        email: user.email || `${user.username}@2d.com`,
        username: user.username,
        name: user.name,
        role: user.role || 'agent',
        commission_rate: user.commission_rate || 15.0
      }
    };
  }

  throw new Error('အကောင့် အီးမေးလ် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်');
}

/**
 * Banker Creates New Agent Account
 */
async function createAgentAccount({ name, email, password, commission_rate = 15.0, credit_limit = 1000000 }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = (name || '').trim();
  const cleanPwd = (password || '').trim();
  const comm = parseFloat(commission_rate) || 15.0;
  const username = cleanEmail.split('@')[0];

  if (!cleanName || !cleanEmail || !cleanPwd) {
    throw new Error('အေးဂျင့် အမည်၊ Email နှင့် စကားဝှက် အပြည့်အစုံ ဖြည့်သွင်းပေးပါ');
  }

  // 1. If Supabase is connected, provision auth user
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPwd,
        options: {
          data: {
            username,
            name: cleanName,
            role: 'agent',
            commission_rate: comm
          }
        }
      });
    } catch (supaErr) {
      console.warn('Supabase agent signup notice:', supaErr.message);
    }
  }

  // 2. Insert into database
  const result = await run(
    `INSERT INTO users (username, email, password, name, role, commission_rate, credit_limit) 
     VALUES (?, ?, ?, ?, 'agent', ?, ?)`,
    [username, cleanEmail, cleanPwd, cleanName, comm, credit_limit]
  );

  return {
    id: result.id,
    name: cleanName,
    email: cleanEmail,
    username,
    role: 'agent',
    commission_rate: comm
  };
}

module.exports = {
  isSupabaseConfigured,
  supabase,
  loginUser,
  createAgentAccount,
  PRESET_ACCOUNTS
};
