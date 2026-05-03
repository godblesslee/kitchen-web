-- Editable rules page content for the simple admin editor.
CREATE TABLE IF NOT EXISTS kitchen_rule_sections (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  sort_order INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE kitchen_rule_sections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitchen_rule_sections'
      AND policyname = 'rule_sections_read_all'
  ) THEN
    CREATE POLICY "rule_sections_read_all" ON kitchen_rule_sections FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitchen_rule_sections'
      AND policyname = 'rule_sections_public_insert'
  ) THEN
    CREATE POLICY "rule_sections_public_insert" ON kitchen_rule_sections FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kitchen_rule_sections'
      AND policyname = 'rule_sections_public_update'
  ) THEN
    CREATE POLICY "rule_sections_public_update" ON kitchen_rule_sections FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO kitchen_rule_sections (key, title, content, sort_order, enabled) VALUES
  (
    'devices',
    '设备介绍',
    '{
      "type": "devices",
      "items": [
        {
          "icon": "🔥",
          "name": "风炉",
          "desc": "热风循环烤箱，受热均匀，适合烤饼干、泡芙、马卡龙、可颂等。",
          "tips": ["提前预热至设定温度", "避免频繁开门导致温度波动", "使用浅色烤盘"],
          "linkText": "查看风炉使用视频",
          "linkUrl": ""
        },
        {
          "icon": "🍞",
          "name": "平炉",
          "desc": "传统面火底火烤箱，上下火独立控制，适合烤面包、蛋糕、披萨。",
          "tips": ["上下火可根据食谱分别调节", "烤面包可在底部放水增加蒸汽", "蛋糕类使用中层烤位"],
          "linkText": "查看平炉使用视频",
          "linkUrl": ""
        },
        {
          "icon": "🧫",
          "name": "发酵箱",
          "desc": "恒温恒湿控制，用于面团发酵，保持稳定环境。",
          "tips": ["发酵温度控制在 28-38°C", "湿度保持 75-85%", "面团需用保鲜膜覆盖防干"],
          "linkText": "查看发酵箱使用视频",
          "linkUrl": ""
        }
      ]
    }'::jsonb,
    1,
    true
  ),
  (
    'booking_rules',
    '预约规则',
    '{
      "type": "list",
      "items": [
        { "text": "预约前请确认设备状态为可用", "linkText": "", "linkUrl": "" },
        { "text": "单次最长预约 2 小时，每台设备每天最多预约 2 次", "linkText": "", "linkUrl": "" },
        { "text": "预约后无法按时使用，请提前取消释放时段", "linkText": "", "linkUrl": "" },
        { "text": "使用后请清洁设备和工作台面", "linkText": "", "linkUrl": "" },
        { "text": "如有损坏请及时告知管理员", "linkText": "", "linkUrl": "" }
      ]
    }'::jsonb,
    2,
    true
  ),
  (
    'violation_rules',
    '违规处理',
    '{
      "type": "list",
      "items": [
        { "text": "初次提醒：口头警告 2 次，超过后转入自我整改", "linkText": "", "linkUrl": "" },
        { "text": "自我整改：在地群自我检讨 2 次，超过后转入限制措施", "linkText": "", "linkUrl": "" },
        { "text": "限制措施：限制使用共享厨房 3-7 天或整个入住周期", "linkText": "", "linkUrl": "" }
      ]
    }'::jsonb,
    3,
    true
  )
ON CONFLICT (key) DO NOTHING;
