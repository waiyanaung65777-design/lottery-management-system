-- ========================================================
-- Supabase Schema for 2D/3D Lottery Management System
-- ========================================================

-- 1. Profiles Table (Extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('banker', 'agent')) DEFAULT 'agent',
  commission_rate NUMERIC DEFAULT 15.0,
  payout_multiplier_2d NUMERIC DEFAULT 85.0,
  payout_multiplier_3d NUMERIC DEFAULT 600.0,
  credit_limit NUMERIC DEFAULT 1000000,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- 2. Lottery Sessions Table
CREATE TABLE IF NOT EXISTS public.sessions (
  id BIGSERIAL PRIMARY KEY,
  lottery_type TEXT NOT NULL CHECK (lottery_type IN ('2D', '3D')),
  session_name TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'settled')),
  winning_number TEXT,
  payout_multiplier NUMERIC DEFAULT 85.0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  settled_at TIMESTAMPTZ
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sessions are viewable by all authenticated users"
  ON public.sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only banker can modify sessions"
  ON public.sessions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'banker'));

-- 3. Number Limits / Blocked Numbers Table
CREATE TABLE IF NOT EXISTS public.number_limits (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT REFERENCES public.sessions(id) ON DELETE CASCADE,
  lottery_type TEXT NOT NULL CHECK (lottery_type IN ('2D', '3D')),
  number TEXT NOT NULL,
  max_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.number_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Number limits viewable by all authenticated users"
  ON public.number_limits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only banker can modify limits"
  ON public.number_limits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'banker'));

-- 4. Betting Slips Table
CREATE TABLE IF NOT EXISTS public.slips (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.profiles(id),
  session_id BIGINT NOT NULL REFERENCES public.sessions(id),
  customer_name TEXT NOT NULL,
  raw_text TEXT,
  lottery_type TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  commission_rate NUMERIC NOT NULL,
  commission_amount NUMERIC NOT NULL,
  net_to_banker NUMERIC NOT NULL,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents can view their own slips and Bankers can view all slips"
  ON public.slips FOR SELECT TO authenticated
  USING (
    agent_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'banker')
  );

CREATE POLICY "Agents can insert slips"
  ON public.slips FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid());

-- 5. Slip Items Table
CREATE TABLE IF NOT EXISTS public.slip_items (
  id BIGSERIAL PRIMARY KEY,
  slip_id BIGINT NOT NULL REFERENCES public.slips(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  is_winner INTEGER DEFAULT 0,
  win_amount NUMERIC DEFAULT 0
);

ALTER TABLE public.slip_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Slip items viewable according to slip policy"
  ON public.slip_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.slips s 
      WHERE s.id = slip_id AND (
        s.agent_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'banker')
      )
    )
  );

-- 6. Trigger to automatically create a profile record when a user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, name, role, commission_rate)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'agent'),
    COALESCE((NEW.raw_user_meta_data->>'commission_rate')::numeric, 15.0)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed initial sessions
INSERT INTO public.sessions (lottery_type, session_name, status, payout_multiplier)
VALUES 
('2D', 'ယနေ့ 2D (12:01 PM)', 'open', 85.0),
('2D', 'ယနေ့ 2D (04:30 PM)', 'open', 85.0),
('3D', '3D ပွဲစဉ် (၁၆ ရက်နေ့)', 'open', 600.0)
ON CONFLICT DO NOTHING;
