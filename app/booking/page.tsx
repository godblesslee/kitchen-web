'use client';

import { supabase } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeToMin(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minToTime(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

function BookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const deviceId = searchParams.get("deviceId") || "";
  const date = searchParams.get("date") || "";
  const presetStart = searchParams.get("start") || "";

  const [wechatName, setWechatName] = useState("");
  const [device, setDevice] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [maxDuration, setMaxDuration] = useState(2);
  const [maxDaily, setMaxDaily] = useState(2);

  const [selectedStart, setSelectedStart] = useState("");
  const [selectedEnd, setSelectedEnd] = useState("");
  const [hoverEnd, setHoverEnd] = useState("");
  const [hint, setHint] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const name = localStorage.getItem("kitchen_wechat_name");
    if (name) setWechatName(name);
    loadConfig();
  }, []);

  useEffect(() => {
    if (wechatName && deviceId && date) loadSchedule();
  }, [wechatName, deviceId, date]);

  async function loadConfig() {
    const { data } = await supabase.from("kitchen_configs").select("*");
    if (data) {
      const cfg: any = {};
      data.forEach((r: any) => { cfg[r.key] = Number(r.value) || r.value; });
      setMaxDuration(cfg.max_duration || 2);
      setMaxDaily(cfg.max_daily || 2);
    }
  }

  async function loadSchedule() {
    const { data: dev } = await supabase.from("kitchen_devices").select("*").eq("id", deviceId).single();
    setDevice(dev);
    const { data: bks } = await supabase
      .from("kitchen_bookings").select("*").eq("device_id", deviceId).eq("date", date).eq("status", 1);

    const myCount = (bks || []).filter((b: any) => b.wechat_name === wechatName).length;

    const slotList = [];
    for (let h = 6; h < 22; h += 0.5) {
      const time = minToTime(h * 60);
      const bk = (bks || []).find((b: any) =>
        timeToMin(b.start_time) <= h * 60 && timeToMin(b.end_time) > h * 60
      );
      slotList.push({
        time,
        available: !bk && dev?.status === 1,
        bookedBy: bk?.wechat_name || "",
        isMy: bk?.wechat_name === wechatName,
        maintenance: dev?.status === 0
      });
    }
    setSlots(slotList);

    if (myCount >= maxDaily) setHint(`今日已达上限 ${maxDaily} 次`);
  }

  // If coming from home page with a preset start time
  useEffect(() => {
    if (presetStart && slots.length > 0) {
      setSelectedStart(presetStart);
      setHint("");
    }
  }, [presetStart, slots]);

  function handleSlotClick(time: string) {
    const s = slots.find(a => a.time === time);
    if (!s?.available) return;

    if (!selectedStart || (selectedStart && selectedEnd)) {
      // Start a new selection
      setSelectedStart(time);
      setSelectedEnd("");
      setHint("再选结束时间");
    } else {
      // Set end time
      const dur = timeToMin(time) - timeToMin(selectedStart);
      if (dur <= 0) { setSelectedStart(time); setHint("再选结束时间"); return; }
      if (dur / 60 > maxDuration) {
        setHint(`单次最长 ${maxDuration} 小时`);
        return;
      }
      setSelectedEnd(time);
      setHint("");
    }
  }

  function getSlotStatus(time: string) {
    const s = slots.find(a => a.time === time);
    if (!s) return "hidden";
    if (selectedStart && !selectedEnd) {
      const dur = timeToMin(time) - timeToMin(selectedStart);
      const notAvailableAfter = slots.slice(
        slots.findIndex(a => a.time === selectedStart),
        slots.findIndex(a => a.time === time) + 1
      ).some(a => !a.available);
      if (time === selectedStart) return "start-selected";
      if (dur > 0 && dur / 60 <= maxDuration && !notAvailableAfter) return "in-range";
      if (dur > 0 && (dur / 60 > maxDuration || notAvailableAfter)) return "out-of-range";
    }
    if (selectedStart === time && selectedEnd === time) return "start-selected";
    if (selectedStart && selectedEnd && time === selectedEnd) return "end-selected";
    if (selectedStart && selectedEnd &&
        timeToMin(time) > timeToMin(selectedStart) && timeToMin(time) < timeToMin(selectedEnd)) {
      return "in-range";
    }
    if (s.isMy) return "mine";
    if (!s.available) return "taken";
    return "free";
  }

  function getSlotColor(status: string) {
    switch (status) {
      case "start-selected": return "bg-orange-600 text-white ring-2 ring-orange-300";
      case "end-selected": return "bg-orange-500 text-white";
      case "in-range": return "bg-orange-100 text-orange-700";
      case "out-of-range": return "bg-gray-100 text-gray-300 cursor-not-allowed";
      case "mine": return "bg-blue-100 text-blue-600";
      case "taken": return "bg-red-50 text-red-300";
      case "free": return "bg-green-50 text-green-600 hover:bg-orange-100";
      default: return "hidden";
    }
  }

  async function handleSubmit() {
    if (!selectedStart || !selectedEnd || submitting) return;
    const dur = (timeToMin(selectedEnd) - timeToMin(selectedStart)) / 60;
    if (dur > maxDuration) { setHint(`单次最长 ${maxDuration} 小时`); return; }

    setSubmitting(true);

    // Ban check
    const { data: banData } = await supabase.rpc("is_banned", { p_wechat_name: wechatName });
    if (banData) { setHint("你的账号已被限制使用"); setSubmitting(false); return; }

    // Max daily check
    const { data: myBks } = await supabase.from("kitchen_bookings")
      .select("id").eq("wechat_name", wechatName).eq("date", date).eq("status", 1);
    if ((myBks || []).length >= maxDaily) {
      setHint(`今日已达上限 ${maxDaily} 次`); setSubmitting(false); return;
    }

    // Conflict check
    const { data: conflicts } = await supabase.from("kitchen_bookings")
      .select("id").eq("device_id", deviceId).eq("date", date).eq("status", 1)
      .or(`and(start_time.lte.${selectedEnd},end_time.gt.${selectedStart})`);
    if (conflicts && conflicts.length > 0) { setHint("该时段已被他人预约"); setSubmitting(false); return; }

    const { error } = await supabase.from("kitchen_bookings").insert({
      device_id: deviceId, date, wechat_name: wechatName,
      start_time: selectedStart, end_time: selectedEnd, status: 1
    });

    if (error) { setHint(error.message); } else {
      alert("预约成功！"); router.push("/");
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      <button onClick={() => router.push("/")} className="text-orange-500 mb-4">← 返回</button>
      <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
        <h2 className="text-lg font-bold">{device?.name || "加载中"}</h2>
        <p className="text-gray-400 text-sm">{date} · @{wechatName}</p>
      </div>

      <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-semibold mb-2">
          {!selectedStart ? "选择开始时间" : !selectedEnd ? "选择结束时间" : `确定: ${selectedStart} → ${selectedEnd}`}
        </h3>
        <div className="flex gap-1 min-w-max">
          {slots.map(s => {
            const status = getSlotStatus(s.time);
            return (
              <button
                key={s.time}
                onClick={() => handleSlotClick(s.time)}
                disabled={status === "out-of-range" || status === "taken"}
                className={`flex-shrink-0 w-12 py-2 rounded-lg text-[10px] text-center transition-all ${getSlotColor(status)}`}
              >
                <div className="font-medium">{s.time}</div>
                {s.bookedBy && <div className="truncate">{s.bookedBy}</div>}
                {s.maintenance && <div className="text-gray-400">维护</div>}
              </button>
            );
          })}
        </div>

        {/* Hour labels */}
        <div className="flex justify-between text-[10px] text-gray-400 mt-2 pl-[-2px]">
          {[6,8,10,12,14,16,18,20,22].map(h => <span key={h}>{h}</span>)}
        </div>
      </div>

      {hint && <p className={`text-sm text-center mb-3 ${hint.includes("最长") || hint.includes("限制") || hint.includes("上限") || hint.includes("他人") ? "text-red-500" : "text-gray-500"}`}>{hint}</p>}

      <button
        disabled={!selectedEnd || submitting}
        onClick={handleSubmit}
        className="w-full bg-orange-500 text-white rounded-2xl py-3.5 font-medium text-base disabled:opacity-40 shadow-sm"
      >{submitting ? "提交中..." : "确认预约"}</button>

      {(selectedStart || selectedEnd) && (
        <button
          onClick={() => { setSelectedStart(""); setSelectedEnd(""); setHint(""); }}
          className="w-full text-gray-400 text-sm py-3 mt-1"
        >清除选择</button>
      )}
    </div>
  );
}

export default function BookingPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-gray-400">加载中...</div>}>
    <BookingContent />
  </Suspense>;
}
