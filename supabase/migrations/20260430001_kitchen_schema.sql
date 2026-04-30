-- Kitchen Booking System Schema
-- Run in Supabase SQL Editor

-- Devices
CREATE TABLE IF NOT EXISTS kitchen_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles (links to auth.users)
CREATE TABLE IF NOT EXISTS kitchen_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nickname TEXT,
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
  user_id UUID REFERENCES kitchen_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
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

-- Conflict prevention index
CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_no_conflict 
  ON kitchen_bookings(device_id, date, start_time) 
  WHERE status = 1;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kitchen_bookings_device_date ON kitchen_bookings(device_id, date, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_bookings_user ON kitchen_bookings(user_id, created_at DESC);

-- RLS: Enable row level security
ALTER TABLE kitchen_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_admin_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- devices: public read
CREATE POLICY "devices_read_all" ON kitchen_devices FOR SELECT USING (true);
CREATE POLICY "devices_admin_all" ON kitchen_devices FOR ALL USING (
  auth.uid() IN (SELECT id FROM kitchen_profiles WHERE role = 1)
);

-- bookings: public read, insert own, update own or admin
CREATE POLICY "bookings_read_all" ON kitchen_bookings FOR SELECT USING (true);
CREATE POLICY "bookings_insert" ON kitchen_bookings FOR INSERT WITH CHECK (
  auth.uid() = user_id AND 
  auth.uid() NOT IN (SELECT id FROM kitchen_profiles WHERE ban_status > 0 AND (ban_until IS NULL OR ban_until > NOW()))
);
CREATE POLICY "bookings_update_own" ON kitchen_bookings FOR UPDATE USING (
  auth.uid() = user_id OR auth.uid() IN (SELECT id FROM kitchen_profiles WHERE role = 1)
);

-- configs: admin only
CREATE POLICY "configs_read_all" ON kitchen_configs FOR SELECT USING (true);
CREATE POLICY "configs_admin" ON kitchen_configs FOR ALL USING (
  auth.uid() IN (SELECT id FROM kitchen_profiles WHERE role = 1)
);

-- Insert default configs
INSERT INTO kitchen_configs (key, value) VALUES
  ('max_duration', '2'),
  ('max_daily', '2'),
  ('booking_window', '7'),
  ('slot_minutes', '30'),
  ('start_hour', '6'),
  ('end_hour', '22')
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
