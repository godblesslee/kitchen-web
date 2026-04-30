'use client';

import { createClient } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { Device, Booking, Slot } from "@/lib/types";

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const deviceId = searchParams.get("deviceId") || "";
  const date = searchParams.get("date") || "";
  const supabase = createClient();

  const [device, setDevice] = useState<Device | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [myBookingsToday, setMyBookingsToday] = useState(0);
  const [config, setConfig] = useState({ max_duration: 2, max_daily: 2, start_hour: 6, end_hour: 22, slot_minutes: 30 });
  const [selectedStart, setSelectedStart] = useState("");
  const [duration, setDuration] = useState(1);
  const [canBook, setCanBook] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!deviceId || !date) return;
    loadData();
  }, [deviceId, date]);

  async function loadData() {
    const { data: dev } = await supabase.from("kitchen_devices").select("*").eq("id", deviceId).single();
    setDevice(dev);

    const { data: cfgRows } = await supabase.from("kitchen_configs").select("*");
    if (cfgRows) {
      const cfg: any = { max_duration: 2, max_daily: 2, start_hour: 6, end_hour: 22, slot_minutes: 30 };
      cfgRows.forEach((r) => { cfg[r.key] = Number(r.value) || r.value; });
      setConfig(cfg);
    }

    loadSchedule(dev);
  }

  async function loadSchedule(dev: Device | null) {
    const d = dev || device;
    if (!d) return;
    const startH = config.start_hour;
    const endH = config.end_hour;
    const slotMin = config.slot_minutes;

    const { data: bks } = await supabase
      .from("kitchen_bookings")
      .select("*")
      .eq("device_id", deviceId)
      .eq("date", date)
      .eq("status", 1);

    const bookings = bks || [];

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    let myCount = 0;
    const occupiedMap: Record<string, string> = {};

    for (const b of bookings) {
      if (b.user_id === userId) myCount++;
      for (let t = timeToMin(b.start_time); t < timeToMin(b.end_time); t += slotMin) {
        occupiedMap[minToTime(t)] = b.user_id === userId ? "mine" : b.user_id;
      }
    }
    setMyBookingsToday(myCount);

    const slotList: Slot[] = [];
    const totalMin = (endH - startH) * 60;
    for (let i = 0; i < totalMin; i += slotMin) {
      const time = minToTime(startH * 60 + i);
      const occupant = occupiedMap[time];
      let available = d.status === 1;
      let takenBy = "";
      let isMy = false;

      if (occupant === "mine") { available = false; isMy = true; takenBy = "我"; }
      else if (occupant) { available = false; }
      else if (d.status === 0) { available = false; takenBy = "维护"; }

      slotList.push({ time, available, takenBy, isMy, maintenance: d.status === 0 });
    }

    setSlots(slotList);
  }

  function handleSlotClick(time: string) {
    const s = slots.find((s) => s.time === time);
    if (!s?.available) return;
    setSelectedStart(time);
    setError("");
    validate(time, duration);
  }

  function handleDurationChange(val: number) {
    setDuration(val);
    if (selectedStart) validate(selectedStart, val);
  }

  function validate(start: string, dur: number) {
    const maxD = config.max_duration;
    if (dur > maxD) { setCanBook(false); setError(`单次最长 ${maxD} 小时`); return; }
    if (myBookingsToday >= config.max_daily) { setCanBook(false); setError(`今日已达上限 ${config.max_daily} 次`); return; }

    const startIdx = slots.findIndex((s) => s.time === start);
    const endMin = timeToMin(start) + dur * 60;
    const endStr = minToTime(endMin);
    const endIdx = slots.findIndex((s) => s.time === endStr);
    if (endIdx === -1) { setCanBook(false); setError("超出可预约时间范围"); return; }

    for (let i = startIdx; i < endIdx; i++) {
      if (!slots[i]?.available) { setCanBook(false); setError("所选时段包含已被预约的时间"); return; }
    }
    setCanBook(true);
    setError("");
  }

  async function handleSubmit() {
    if (!canBook || submitting) return;
    setSubmitting(true);
    const endMin = timeToMin(selectedStart) + duration * 60;
    const endTime = minToTime(endMin);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("请先登录"); setSubmitting(false); return; }

    // Check conflict
    const { data: conflicts } = await supabase
      .from("kitchen_bookings")
      .select("id")
      .eq("device_id", deviceId)
      .eq("date", date)
      .eq("status", 1)
      .or(`and(start_time.lte.${endTime},end_time.gt.${selectedStart})`);

    if (conflicts && conflicts.length > 0) {
      setError("该时段已有他人预约");
      setSubmitting(false);
      return;
    }

    const { error: err } = await supabase.from("kitchen_bookings").insert({
      device_id: deviceId,
      user_id: user.id,
      date,
      start_time: selectedStart,
      end_time: endTime,
      status: 1,
    });

    if (err) { setError(err.message); } else {
      alert("预约成功！");
      router.push("/");
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      <button onClick={() => router.push("/")} className="text-orange-500 mb-4">← 返回</button>

      <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
        <h2 className="text-lg font-bold">{device?.name || "加载中"}</h2>
        <p className="text-gray-400 text-sm">{date}</p>
        <p className="text-gray-400 text-xs mt-2">今日已预约 {myBookingsToday} 次</p>
      </div>

      <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-semibold mb-3">选择开始时间</h3>
        <div className="flex gap-1.5 min-w-max">
          {slots.map((s) => (
            <button
              key={s.time}
              onClick={() => handleSlotClick(s.time)}
              disabled={!s.available}
              className={`flex-shrink-0 w-16 py-2 rounded-lg text-xs text-center transition-colors ${
                selectedStart === s.time
                  ? "bg-orange-500 text-white"
                  : s.isMy
                  ? "bg-blue-50 text-blue-600 border border-blue-300"
                  : s.available
                  ? "bg-green-50 text-green-600 border border-green-300"
                  : "bg-gray-50 text-gray-300"
              }`}
            >
              <div>{s.time}</div>
              {s.takenBy && <div className="text-[10px] truncate">{s.takenBy}</div>}
              {s.maintenance && <div className="text-[10px]">维护</div>}
            </button>
          ))}
        </div>
      </div>

      {selectedStart && (
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">使用时长</h3>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded">{selectedStart}</span>
            <span className="text-gray-400">→</span>
            <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded">{minToTime(timeToMin(selectedStart) + duration * 60)}</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={config.max_duration}
            step={0.5}
            value={duration}
            onChange={(e) => handleDurationChange(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            {[0.5, 1, 1.5, 2].filter((v) => v <= config.max_duration).map((v) => (
              <span key={v}>{v}h</span>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-sm text-center mb-3">{error}</p>}

      <button
        disabled={!canBook || submitting}
        onClick={handleSubmit}
        className="w-full bg-orange-500 text-white rounded-2xl py-3.5 font-medium text-base disabled:opacity-40 shadow-sm"
      >{submitting ? "提交中..." : "确认预约"}</button>
    </div>
  );
}

export default function BookingPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-gray-400">加载中...</div>}>
    <BookingContent />
  </Suspense>;
}
