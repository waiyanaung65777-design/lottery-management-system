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

/**
 * Sign In User
 */
async function loginUser(emailOrUsername, password) {
  // If Supabase is connected, authenticate via Supabase Auth
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailOrUsername,
      password: password
    });

    if (error) {
      throw new Error(error.message);
    }

    // Fetch profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return {
      token: data.session?.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.name || data.user.email,
        role: profile?.role || 'agent',
        commission_rate: profile?.commission_rate || 15.0
      }
    };
  }

  // Local SQLite Auth Fallback / Demo Mode
  const user = await get(
    `SELECT * FROM users WHERE username = ? OR username = ?`,
    [emailOrUsername, emailOrUsername.split('@')[0]]
  );

  if (!user) {
    throw new Error('အကောင့် အမည် သို့မဟုတ် Email မှားယွင်းနေပါသည်');
  }

  // In demo mode, accept any password or matching password
  return {
    token: `demo-token-${user.id}-${Date.now()}`,
    user: {
      id: user.id,
      email: `${user.username}@lottery.com`,
      username: user.username,
      name: user.name,
      role: user.role,
      commission_rate: user.commission_rate
    }
  };
}

module.exports = {
  isSupabaseConfigured,
  supabase,
  loginUser
};
