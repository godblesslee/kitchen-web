-- Kitchen Booking System Schema
-- Run in Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Devices
CREATE TABLE IF NOT EXISTS kitchen_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles are keyed by an app-generated UUID and identified by nickname.
CREATE TABLE IF NOT EXISTS kitchen_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  nickname TEXT UNIQUE,
  avatar TEXT,
  role INTEGER DEFAULT 0,
  ban_status INTEGER DEFAULT 0,
  ban_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bookings
CREATE TABLE IF NOT EXISTS kitchen_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES kitchen_devices(id) ON DELETE CASCADE,
  user_id UUID REFERENCES kitchen_profiles(id) ON DELETE SET NULL,
  wechat_name TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CONSTRAINT kitchen_bookings_valid_time CHECK (start_time < end_time),
  status INTEGER DEFAULT 1,
  canceled_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configs
CREATE TABLE IF NOT EXISTS kitchen_configs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin logs
CREATE TABLE IF NOT EXISTS kitchen_admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES kitchen_profiles(id),
  action TEXT NOT NULL,
  target_id TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conflict prevention. The exclusion constraint catches overlapping active
-- bookings, while the unique index keeps exact duplicate starts cheap to find.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_no_conflict 
  ON kitchen_bookings(device_id, date, start_time) 
  WHERE status = 1;

ALTER TABLE kitchen_bookings
  ADD CONSTRAINT kitchen_bookings_no_active_overlap
  EXCLUDE USING gist (
    device_id WITH =,
    date WITH =,
    tsrange(
      date + start_time,
      date + end_time,
      '[)'
    ) WITH &&
  )
  WHERE (status = 1);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kitchen_bookings_device_date ON kitchen_bookings(device_id, date, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_bookings_user ON kitchen_bookings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_bookings_wechat ON kitchen_bookings(wechat_name, created_at DESC);

-- RLS: Enable row level security
ALTER TABLE kitchen_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_admin_logs ENABLE ROW LEVEL SECURITY;

-- Ban check used by the booking page and booking insert policy.
CREATE OR REPLACE FUNCTION is_banned(p_wechat_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM kitchen_profiles
    WHERE nickname = p_wechat_name
      AND ban_status > 0
      AND (ban_until IS NULL OR ban_until > NOW())
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS Policies
-- This app currently uses a shared anon client plus a local WeChat nickname,
-- not Supabase Auth. These policies match that product model.
CREATE POLICY "devices_read_all" ON kitchen_devices FOR SELECT USING (true);
CREATE POLICY "devices_public_update" ON kitchen_devices FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "profiles_read_all" ON kitchen_profiles FOR SELECT USING (true);
CREATE POLICY "profiles_public_insert" ON kitchen_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_public_update" ON kitchen_profiles FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "bookings_read_all" ON kitchen_bookings FOR SELECT USING (true);
CREATE POLICY "bookings_insert_unbanned" ON kitchen_bookings FOR INSERT WITH CHECK (
  NOT is_banned(wechat_name)
);
CREATE POLICY "bookings_public_update" ON kitchen_bookings FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "configs_read_all" ON kitchen_configs FOR SELECT USING (true);
CREATE POLICY "configs_public_insert" ON kitchen_configs FOR INSERT WITH CHECK (true);
CREATE POLICY "configs_public_update" ON kitchen_configs FOR UPDATE USING (true) WITH CHECK (true);

-- Insert default configs
INSERT INTO kitchen_configs (key, value) VALUES
  ('max_duration', '2'),
  ('max_daily', '2'),
  ('booking_window', '7'),
  ('slot_minutes', '30'),
  ('start_hour', '6'),
  ('end_hour', '24'),
  ('admin_password', 'changeme')
ON CONFLICT (key) DO NOTHING;

-- Insert default devices
INSERT INTO kitchen_devices (id, name, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', '风炉', '热风循环烤箱 · 适合烤饼干/泡芙/马卡龙/可颂', 1),
  ('00000000-0000-0000-0000-000000000002', '平炉', '传统面火底火 · 适合烤面包/蛋糕/披萨', 2),
  ('00000000-0000-0000-0000-000000000003', '发酵箱', '恒温恒湿控制 · 适合面团发酵', 3)
ON CONFLICT (id) DO NOTHING;

-- Auto-unban function (called by cron)
CREATE OR REPLACE FUNCTION kitchen_auto_unban()
RETURNS INTEGER AS $$
DECLARE
  unbanned INTEGER;
BEGIN
  UPDATE kitchen_profiles
  SET ban_status = 0, ban_until = NULL
  WHERE ban_status = 1 AND ban_until < NOW();
  GET DIAGNOSTICS unbanned = ROW_COUNT;
  RETURN unbanned;
END;
$$ LANGUAGE plpgsql;

-- Log admin actions helper
CREATE OR REPLACE FUNCTION log_admin_action(
  p_admin_id UUID,
  p_action TEXT,
  p_target_id TEXT DEFAULT NULL,
  p_detail TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO kitchen_admin_logs (admin_id, action, target_id, detail)
  VALUES (p_admin_id, p_action, p_target_id, p_detail);
END;
$$ LANGUAGE plpgsql;
