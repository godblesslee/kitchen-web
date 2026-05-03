'use client';

import { defaultRuleSections, normalizeRuleSections, RuleSection } from "@/lib/rules";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function RulesPage() {
  const router = useRouter();
  const [sections, setSections] = useState<RuleSection[]>(defaultRuleSections);

  useEffect(() => {
    async function loadRules() {
      const { data } = await supabase
        .from("kitchen_rule_sections")
        .select("*")
        .eq("enabled", true)
        .order("sort_order");
      setSections(normalizeRuleSections(data));
    }
    loadRules();
  }, []);

  const devicesSection = sections.find((section) => section.key === "devices");
  const bookingSection = sections.find((section) => section.key === "booking_rules");
  const violationSection = sections.find((section) => section.key === "violation_rules");

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">使用规则</h1>
        <button onClick={() => router.push("/")} className="text-sm text-gray-500">← 首页</button>
      </div>

      {devicesSection?.content.type === "devices" && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">{devicesSection.title}</h2>
          {devicesSection.content.items.map((d) => (
            <div key={d.name} className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="text-3xl">{d.icon}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{d.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{d.desc}</p>
                  {d.linkUrl && (
                    <a
                      href={d.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600"
                    >
                      {d.linkText || "查看使用视频"} ›
                    </a>
                  )}
                  {d.tips.length > 0 && (
                    <div className="mt-3 bg-amber-50 rounded-xl p-3">
                      <p className="text-xs font-medium text-orange-600 mb-1">使用小贴士</p>
                      {d.tips.map((tip, i) => (
                        <p key={i} className="text-xs text-gray-500 leading-relaxed">{i + 1}. {tip}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {bookingSection?.content.type === "list" && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 mt-6 mb-3">{bookingSection.title}</h2>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            {bookingSection.content.items.map((rule, i) => (
              <p key={i} className="text-sm text-gray-600 leading-loose">
                {i + 1}. {rule.text}
                {rule.linkUrl && (
                  <a href={rule.linkUrl} target="_blank" rel="noreferrer" className="ml-2 font-medium text-orange-600">
                    {rule.linkText || "查看链接"} ›
                  </a>
                )}
              </p>
            ))}
          </div>
        </>
      )}

      {violationSection?.content.type === "list" && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 mt-6 mb-3">{violationSection.title}</h2>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            {violationSection.content.items.map((r, i) => (
              <p key={i} className="text-sm text-gray-600 leading-loose">
                {i + 1}. {r.text}
                {r.linkUrl && (
                  <a href={r.linkUrl} target="_blank" rel="noreferrer" className="ml-2 font-medium text-orange-600">
                    {r.linkText || "查看链接"} ›
                  </a>
                )}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
