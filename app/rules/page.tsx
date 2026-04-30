'use client';

import { useRouter } from "next/navigation";

const devices = [
  {
    icon: "🔥", name: "风炉",
    desc: "热风循环烤箱，受热均匀，适合烤饼干、泡芙、马卡龙、可颂等。",
    tips: ["提前预热至设定温度", "避免频繁开门导致温度波动", "使用浅色烤盘"]
  },
  {
    icon: "🍞", name: "平炉",
    desc: "传统面火底火烤箱，上下火独立控制，适合烤面包、蛋糕、披萨。",
    tips: ["上下火可根据食谱分别调节", "烤面包可在底部放水增加蒸汽", "蛋糕类使用中层烤位"]
  },
  {
    icon: "🧫", name: "发酵箱",
    desc: "恒温恒湿控制，用于面团发酵，保持稳定环境。",
    tips: ["发酵温度控制在 28-38°C", "湿度保持 75-85%", "面团需用保鲜膜覆盖防干"]
  }
];

export default function RulesPage() {
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">使用规则</h1>
        <button onClick={() => router.push("/")} className="text-sm text-gray-500">← 首页</button>
      </div>

      <h2 className="text-sm font-semibold text-gray-500 mb-3">设备介绍</h2>
      {devices.map((d) => (
        <div key={d.name} className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-3xl">{d.icon}</span>
            <div>
              <h3 className="font-semibold">{d.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{d.desc}</p>
              <div className="mt-3 bg-amber-50 rounded-xl p-3">
                <p className="text-xs font-medium text-orange-600 mb-1">使用小贴士</p>
                {d.tips.map((tip, i) => (
                  <p key={i} className="text-xs text-gray-500 leading-relaxed">{i + 1}. {tip}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      <h2 className="text-sm font-semibold text-gray-500 mt-6 mb-3">预约规则</h2>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        {[
          "预约前请确认设备状态为可用",
          "单次最长预约 2 小时，每天最多预约 2 次",
          "预约后无法按时使用，请提前取消释放时段",
          "使用后请清洁设备和工作台面",
          "如有损坏请及时告知管理员"
        ].map((rule, i) => (
          <p key={i} className="text-sm text-gray-600 leading-loose">{i + 1}. {rule}</p>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-gray-500 mt-6 mb-3">违规处理</h2>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        {[
          "初次提醒：口头警告 2 次，超过后转入自我整改",
          "自我整改：在地群自我检讨 2 次，超过后转入限制措施",
          "限制措施：限制使用共享厨房 3-7 天或整个入住周期"
        ].map((r, i) => (
          <p key={i} className="text-sm text-gray-600 leading-loose">{i + 1}. {r}</p>
        ))}
      </div>
    </div>
  );
}
