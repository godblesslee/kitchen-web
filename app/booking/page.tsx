'use client';

import { supabase } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function timeToMin(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minToTime(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nextBookableMinute(slotMinutes: number): number {
  const now = new Date();
  return Math.ceil((now.getHours() * 60 + now.getMinutes()) / slotMinutes) * slotMinutes;
}
function configNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type Device = { id: string; name: string; status: number };
type Booking = { id: string; wechat_name: string; start_time: string; end_time: string };
type Slot = {
  time: string;
  available: boolean;
  bookedBy: string;
  isMy: boolean;
  maintenance: boolean;
  past: boolean;
};

const LATEST_START_HOUR = 22;
const DEFAULT_END_HOUR = 24;

function BookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const deviceId = searchParams.get("deviceId") || "";
  const date = searchParams.get("date") || "";
  const presetStart = searchParams.get("start") || "";

  const [wechatName, setWechatName] = useState("");
  const [device, setDevice] = useState<Device | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [maxDuration, setMaxDuration] = useState(2);
  const [maxDaily, setMaxDaily] = useState(2);
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [startHour, setStartHour] = useState(6);
  const [endHour, setEndHour] = useState(DEFAULT_END_HOUR);
  const [configReady, setConfigReady] = useState(false);

  const [selectedStart, setSelectedStart] = useState("");
  const [selectedEnd, setSelectedEnd] = useState("");
  const [hint, setHint] = useState("");
  const [dailyBookingCount, setDailyBookingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const name = localStorage.getItem("kitchen_wechat_name");
    if (name) setWechatName(name);
    loadConfig();
  }, []);

  useEffect(() => {
    if (configReady && wechatName && deviceId && date) loadSchedule();
  }, [configReady, wechatName, deviceId, date]);

  useEffect(() => {
    if (presetStart && slots.some(s => s.time === presetStart && s.available)) {
      setSelectedStart(presetStart);
      setSelectedEnd("");
      setHint("选择结束时间");
    }
  }, [presetStart, slots]);

  const startOptions = useMemo(
    () => slots.filter(s => !s.maintenance && timeToMin(s.time) <= LATEST_START_HOUR * 60),
    [slots]
  );

  const endOptions = useMemo(() => {
    if (!selectedStart) return [];
    const startMin = timeToMin(selectedStart);
    const maxEnd = maxDuration > 0 ? Math.min(endHour * 60, startMin + maxDuration * 60) : endHour * 60;
    const options: { time: string; available: boolean; reason: string }[] = [];

    for (let t = startMin + slotMinutes; t <= maxEnd; t += slotMinutes) {
      const blocked = slots.some(s => {
        const slotStart = timeToMin(s.time);
        return slotStart >= startMin && slotStart < t && !s.available;
      });
      options.push({
        time: minToTime(t),
        available: !blocked,
        reason: blocked ? "中间有占用" : "",
      });
      if (blocked) break;
    }
    return options;
  }, [selectedStart, slots, maxDuration, endHour, slotMinutes]);

  const durationText = useMemo(() => {
    if (!selectedStart || !selectedEnd) return "未完成";
    const hours = (timeToMin(selectedEnd) - timeToMin(selectedStart)) / 60;
    return `${hours % 1 === 0 ? hours : hours.toFixed(1)} 小时`;
  }, [selectedStart, selectedEnd]);

  const dailyLimitReached = maxDaily > 0 && dailyBookingCount >= maxDaily;

  async function loadConfig() {
    const { data } = await supabase.from("kitchen_configs").select("*");
    if (!data) {
      setConfigReady(true);
      return;
    }
    const cfg: Record<string, string> = {};
    data.forEach((r: { key: string; value: string }) => { cfg[r.key] = r.value; });
    setMaxDuration(configNumber(cfg.max_duration, 2));
    setMaxDaily(configNumber(cfg.max_daily, 2));
    setSlotMinutes(configNumber(cfg.slot_minutes, 30));
    setStartHour(configNumber(cfg.start_hour, 6));
    setEndHour(Math.max(configNumber(cfg.end_hour, DEFAULT_END_HOUR), DEFAULT_END_HOUR));
    setConfigReady(true);
  }

  async function loadSchedule() {
    const [{ data: dev }, { data: bks }] = await Promise.all([
      supabase.from("kitchen_devices").select("id,name,status").eq("id", deviceId).single(),
      supabase.from("kitchen_bookings")
        .select("id,wechat_name,start_time,end_time")
        .eq("device_id", deviceId).eq("date", date).eq("status", 1),
    ]);
    setDevice(dev as Device | null);

    const bookings = (bks || []) as Booking[];
    const myCount = bookings.filter(b => b.wechat_name === wechatName).length;
    setDailyBookingCount(myCount);
    const slotList: Slot[] = [];
    const today = formatDate(new Date());
    const isPastDate = date < today;
    const isToday = date === today;
    const cutoff = isToday ? nextBookableMinute(slotMinutes) : 0;

    for (let m = startHour * 60; m < endHour * 60; m += slotMinutes) {
      const time = minToTime(m);
      const bk = bookings.find(b => timeToMin(b.start_time) <= m && timeToMin(b.end_time) > m);
      const past = isPastDate || (isToday && m < cutoff);
      slotList.push({
        time,
        available: !past && !bk && dev?.status === 1,
        bookedBy: bk?.wechat_name || "",
        isMy: bk?.wechat_name === wechatName,
        maintenance: dev?.status === 0,
        past
      });
    }

    setSlots(slotList);
    if (maxDaily > 0 && myCount >= maxDaily) setHint(`本设备今日已达上限 ${maxDaily} 次，请先取消已有预约`);
  }

  function selectStart(time: string) {
    if (dailyLimitReached) {
      setHint(`本设备今日已达上限 ${maxDaily} 次，请先取消已有预约`);
      return;
    }
    const slot = slots.find(s => s.time === time);
    if (!slot?.available) return;
    setSelectedStart(time);
    setSelectedEnd("");
    setHint("选择结束时间");
  }

  function selectEnd(time: string) {
    if (dailyLimitReached) {
      setHint(`本设备今日已达上限 ${maxDaily} 次，请先取消已有预约`);
      return;
    }
    const option = endOptions.find(o => o.time === time);
    if (!option?.available) return;
    setSelectedEnd(time);
    setHint("");
  }

  async function handleSubmit() {
    if (!selectedStart || !selectedEnd || submitting) return;
    if (dailyLimitReached) {
      setHint(`本设备今日已达上限 ${maxDaily} 次，请先取消已有预约`);
      return;
    }
    const dur = (timeToMin(selectedEnd) - timeToMin(selectedStart)) / 60;
    if (maxDuration > 0 && dur > maxDuration) { setHint(`单次最长 ${maxDuration} 小时`); return; }

    setSubmitting(true);

    const { data: banData } = await supabase.rpc("is_banned", { p_wechat_name: wechatName });
    if (banData) { setHint("你的账号已被限制使用"); setSubmitting(false); return; }

    if (maxDaily > 0) {
      const { data: myBks } = await supabase.from("kitchen_bookings")
        .select("id").eq("wechat_name", wechatName).eq("device_id", deviceId).eq("date", date).eq("status", 1);
      if ((myBks || []).length >= maxDaily) {
        setHint(`本设备今日已达上限 ${maxDaily} 次`); setSubmitting(false); return;
      }
    }

    const { data: conflicts } = await supabase.from("kitchen_bookings")
      .select("id").eq("device_id", deviceId).eq("date", date).eq("status", 1)
      .or(`and(start_time.lt.${selectedEnd},end_time.gt.${selectedStart})`);
    if (conflicts && conflicts.length > 0) { setHint("该时段已被他人预约"); setSubmitting(false); return; }

    const { error } = await supabase.from("kitchen_bookings").insert({
      device_id: deviceId, date, wechat_name: wechatName,
      start_time: selectedStart, end_time: selectedEnd, status: 1
    });

    if (error) { setHint(error.message); } else {
      alert("预约成功！");
      router.push("/");
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-28">
      <button onClick={() => router.push("/")} className="min-h-11 text-[#c86b3c] mb-2">← 返回</button>

      <div className="sticky top-0 z-10 -mx-4 bg-[#f7f4ef]/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#eee7df]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{device?.name || "加载中"}</h2>
              <p className="text-gray-400 text-sm">{date} · @{wechatName}</p>
            </div>
            <span className="rounded-full bg-[#f4e7de] px-2.5 py-1 text-xs text-[#8a513b]">
              {maxDuration > 0 ? `最长 ${maxDuration} 小时` : "不限时长"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[#f7f4ef] px-3 py-2 text-xs text-[#8a8176]">
            <span>本设备今日已预约</span>
            <span className={dailyLimitReached ? "font-semibold text-[#8a513b]" : "font-semibold text-[#5f594f]"}>
              {dailyBookingCount}{maxDaily > 0 ? ` / ${maxDaily}` : " 次"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className="rounded-xl bg-[#f7f4ef] p-2">
              <p className="text-[10px] text-[#8a8176]">开始</p>
              <p className="font-semibold">{selectedStart || "--:--"}</p>
            </div>
            <div className="rounded-xl bg-[#f7f4ef] p-2">
              <p className="text-[10px] text-[#8a8176]">结束</p>
              <p className="font-semibold">{selectedEnd || "--:--"}</p>
            </div>
            <div className="rounded-xl bg-[#f7f4ef] p-2">
              <p className="text-[10px] text-[#8a8176]">时长</p>
              <p className="font-semibold">{durationText}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <TimeWheel title="开始时间" options={startOptions.map(s => ({
          time: s.time,
          available: s.available,
          label: s.past ? "已过" : s.bookedBy ? `@${s.bookedBy}` : s.maintenance ? "维护" : "可选",
          tone: s.isMy ? "mine" : s.available ? "free" : "taken",
        }))} value={selectedStart} onSelect={selectStart} />
        <TimeWheel title="结束时间" options={endOptions.map(s => ({
          time: s.time,
          available: s.available,
          label: s.reason || "可选",
          tone: s.available ? "free" : "taken",
        }))} value={selectedEnd} onSelect={selectEnd} disabled={!selectedStart} />
      </div>

      {hint && <p className={`text-sm text-center mt-4 ${hint.includes("选择") ? "text-[#8a8176]" : "text-[#8a513b]"}`}>{hint}</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 bg-[#f7f4ef]/95 px-4 pb-5 pt-3 backdrop-blur">
        <div className="max-w-lg mx-auto">
          <button
            disabled={!selectedEnd || submitting || dailyLimitReached}
            onClick={handleSubmit}
            className="w-full bg-[#c86b3c] text-white rounded-2xl py-3.5 font-medium text-base disabled:opacity-40 shadow-sm"
          >{dailyLimitReached ? "已达今日上限" : submitting ? "提交中..." : "确认预约"}</button>
          {(selectedStart || selectedEnd) && (
            <button
              onClick={() => { setSelectedStart(""); setSelectedEnd(""); setHint(""); }}
              className="w-full min-h-11 text-[#8a8176] text-sm mt-1"
            >清除选择</button>
          )}
        </div>
      </div>
    </div>
  );
}

function TimeWheel({
  title,
  options,
  value,
  disabled,
  onSelect,
}: {
  title: string;
  options: { time: string; available: boolean; label: string; tone: "free" | "taken" | "mine" }[];
  value: string;
  disabled?: boolean;
  onSelect: (time: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm border border-[#eee7df]">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {disabled && <span className="text-[10px] text-[#8a8176]">先选开始</span>}
      </div>
      <div className={`h-[360px] overflow-y-auto pr-1 ${disabled ? "opacity-45" : ""}`}>
        {options.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-[#8a8176]">暂无可选时间</div>
        )}
        {options.map(option => {
          const selected = option.time === value;
          const toneClass = selected ? "bg-[#c86b3c] text-white" :
            option.tone === "mine" ? "bg-[#d8e0e4] text-[#425e6b]" :
            option.available ? "bg-[#f7f4ef] text-[#332f2a] active:bg-[#f4e7de]" :
            "bg-[#e2e0da] text-[#8a8176] opacity-70";
          return (
            <button
              key={option.time}
              disabled={disabled || !option.available}
              onClick={() => onSelect(option.time)}
              className={`mb-2 min-h-14 w-full rounded-xl px-3 text-left transition ${toneClass}`}
            >
              <div className="text-base font-semibold">{option.time}</div>
              <div className="text-[10px] opacity-75">{option.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BookingPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-gray-400">加载中...</div>}>
    <BookingContent />
  </Suspense>;
}
