export type RuleLink = {
  linkText?: string;
  linkUrl?: string;
};

export type DeviceRuleItem = RuleLink & {
  icon: string;
  name: string;
  desc: string;
  tips: string[];
};

export type TextRuleItem = RuleLink & {
  text: string;
};

export type RuleSectionContent =
  | { type: "devices"; items: DeviceRuleItem[] }
  | { type: "list"; items: TextRuleItem[] };

export type RuleSection = {
  key: "devices" | "booking_rules" | "violation_rules";
  title: string;
  content: RuleSectionContent;
  sort_order: number;
  enabled: boolean;
};

export const defaultRuleSections: RuleSection[] = [
  {
    key: "devices",
    title: "设备介绍",
    sort_order: 1,
    enabled: true,
    content: {
      type: "devices",
      items: [
        {
          icon: "🔥",
          name: "风炉",
          desc: "热风循环烤箱，受热均匀，适合烤饼干、泡芙、马卡龙、可颂等。",
          tips: ["提前预热至设定温度", "避免频繁开门导致温度波动", "使用浅色烤盘"],
          linkText: "查看风炉使用视频",
          linkUrl: "",
        },
        {
          icon: "🍞",
          name: "平炉",
          desc: "传统面火底火烤箱，上下火独立控制，适合烤面包、蛋糕、披萨。",
          tips: ["上下火可根据食谱分别调节", "烤面包可在底部放水增加蒸汽", "蛋糕类使用中层烤位"],
          linkText: "查看平炉使用视频",
          linkUrl: "",
        },
        {
          icon: "🧫",
          name: "发酵箱",
          desc: "恒温恒湿控制，用于面团发酵，保持稳定环境。",
          tips: ["发酵温度控制在 28-38°C", "湿度保持 75-85%", "面团需用保鲜膜覆盖防干"],
          linkText: "查看发酵箱使用视频",
          linkUrl: "",
        },
      ],
    },
  },
  {
    key: "booking_rules",
    title: "预约规则",
    sort_order: 2,
    enabled: true,
    content: {
      type: "list",
      items: [
        { text: "预约前请确认设备状态为可用", linkText: "", linkUrl: "" },
        { text: "单次最长预约 2 小时，每台设备每天最多预约 2 次", linkText: "", linkUrl: "" },
        { text: "预约后无法按时使用，请提前取消释放时段", linkText: "", linkUrl: "" },
        { text: "使用后请清洁设备和工作台面", linkText: "", linkUrl: "" },
        { text: "如有损坏请及时告知管理员", linkText: "", linkUrl: "" },
      ],
    },
  },
  {
    key: "violation_rules",
    title: "违规处理",
    sort_order: 3,
    enabled: true,
    content: {
      type: "list",
      items: [
        { text: "初次提醒：口头警告 2 次，超过后转入自我整改", linkText: "", linkUrl: "" },
        { text: "自我整改：在地群自我检讨 2 次，超过后转入限制措施", linkText: "", linkUrl: "" },
        { text: "限制措施：限制使用共享厨房 3-7 天或整个入住周期", linkText: "", linkUrl: "" },
      ],
    },
  },
];

export function normalizeRuleSections(rows: unknown): RuleSection[] {
  if (!Array.isArray(rows) || rows.length === 0) return defaultRuleSections;

  const normalized = rows
    .map((row) => {
      const candidate = row as Partial<RuleSection>;
      const fallback = defaultRuleSections.find((section) => section.key === candidate.key);
      if (!fallback) return null;

      return {
        ...fallback,
        ...candidate,
        content: normalizeRuleContent(candidate.content, fallback.content),
        enabled: candidate.enabled ?? fallback.enabled,
        sort_order: candidate.sort_order ?? fallback.sort_order,
      };
    })
    .filter((section): section is RuleSection => Boolean(section))
    .sort((a, b) => a.sort_order - b.sort_order);

  return normalized.length > 0 ? normalized : defaultRuleSections;
}

function normalizeRuleContent(content: unknown, fallback: RuleSectionContent): RuleSectionContent {
  if (!content || typeof content !== "object") return fallback;
  const candidate = content as Partial<RuleSectionContent>;

  if (candidate.type === "devices" && Array.isArray(candidate.items)) {
    return {
      type: "devices",
      items: candidate.items.map((item) => {
        const d = item as Partial<DeviceRuleItem>;
        return {
          icon: String(d.icon || "🍳"),
          name: String(d.name || ""),
          desc: String(d.desc || ""),
          tips: Array.isArray(d.tips) ? d.tips.map(String).filter(Boolean) : [],
          linkText: String(d.linkText || ""),
          linkUrl: String(d.linkUrl || ""),
        };
      }),
    };
  }

  if (candidate.type === "list" && Array.isArray(candidate.items)) {
    return {
      type: "list",
      items: candidate.items.map((item) => {
        const rule = item as Partial<TextRuleItem>;
        return {
          text: String(rule.text || ""),
          linkText: String(rule.linkText || ""),
          linkUrl: String(rule.linkUrl || ""),
        };
      }).filter((item) => item.text),
    };
  }

  return fallback;
}
