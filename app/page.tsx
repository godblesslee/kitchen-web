'use client';

import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeToMin(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minToTime(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

const STORAGE_KEY = "kitchen_wechat_name";

export default function HomePage() {
  const [wechatName, setWechatName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { setWechatName(saved); } else { setShowNameModal(true); }
    checkAdmin();
  }, []);

  useEffect(() => {
    if (wechatName && selectedDate) loadData();
  }, [wechatName, selectedDate]);

  async function checkAdmin() {
    const saved = localStorage.getItem("kitchen_admin");
    if (saved === "true") setIsAdmin(true);
  }

  async function loadData() {
    setLoading(true);
    const { data: devs } = await supabase.from("kitchen_devices").select("*").order("sort_order");
    const { data: bks } = await supabase.from("kitchen_bookings")
      .select("*").eq("date", selectedDate).eq("status", 1);

    if (devs) {
      const enriched = devs.map(d => ({
        ...d,
        slots: buildSlots(d, bks || [], wechatName),
        todayBookings: (bks || []).filter((b: any) => b.device_id === d.id)
      }));
      setDevices(enriched);
    }
    setLoading(false);
  }

  function buildSlots(device: any, bookings: any[], myName: string) {
    const slots = [];
    for (let h = 6; h < 22; h += 0.5) {
      const time = minToTime(h * 60);
      const bk = bookings.find((b: any) =>
        b.device_id === device.id && timeToMin(b.start_time) <= h * 60 && timeToMin(b.end_time) > h * 60
      );
      slots.push({
        time,
        available: !bk && device.status === 1,
        bookedBy: bk?.wechat_name || "",
        isMy: bk?.wechat_name === myName,
        maintenance: device.status === 0,
        bookingStart: bk ? h * 60 === timeToMin(bk.start_time) : false,
        bookingId: bk?.id || ""
      });
    }
    return slots;
  }

  function saveName() {
    const name = nameInput.trim();
    if (!name) return;
    localStorage.setItem(STORAGE_KEY, name);
    setWechatName(name);
    setShowNameModal(false);
  }

  function changeDate(dir: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir);
    setSelectedDate(formatDate(d));
  }

  async function handleSlotClick(deviceId: string, slot: any) {
    if (!slot.available) return;
    router.push(`/booking?deviceId=${deviceId}&date=${selectedDate}&start=${slot.time}`);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("kitchen_admin");
    setWechatName("");
    setIsAdmin(false);
    setShowNameModal(true);
  }

  if (showNameModal) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 bg-amber-50">
        <div className="bg-white rounded-2xl p-8 shadow-sm w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🍳</div>
            <h1 className="text-2xl font-bold">创意厨房预约</h1>
          </div>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveName()}
            placeholder="输入你在社区在地群的微信名称"
            className="w-full border rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:border-orange-400"
            autoFocus
          />
          <button onClick={saveName} disabled={!nameInput.trim()} className="w-full bg-orange-500 text-white rounded-xl py-3 font-medium disabled:opacity-40">
            确认
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">创意厨房</h1>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button onClick={() => router.push("/admin")} className="text-sm text-orange-500">管理</button>
          )}
          <button onClick={() => router.push("/mine")} className="text-sm text-gray-500">我的</button>
          <button onClick={() => router.push("/rules")} className="text-sm text-gray-400">规则</button>
          <span className="text-xs text-gray-400">@{wechatName}</span>
          <button onClick={handleLogout} className="text-xs text-gray-400 underline">切换</button>
        </div>
      </div>

      {/* Date selector */}
      <div className="flex items-center justify-center gap-6 mb-2">
        <button onClick={() => changeDate(-1)} className="text-orange-500 text-lg">◀</button>
        <span className="font-semibold">{selectedDate}</span>
        <button onClick={() => changeDate(1)} className="text-orange-500 text-lg">▶</button>
      </div>

      {/* Mini calendar */}
      <MonthCalendar value={selectedDate} onChange={setSelectedDate} />

      {loading && <div className="text-center text-gray-400 py-10">加载中...</div>}

      {/* Device timelines */}
      {devices.map(dev => (
        <div key={dev.id} className="mb-4 bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">{dev.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${dev.status === 1 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
              {dev.status === 1 ? "可用" : "维护中"}
            </span>
          </div>

          {/* Timeline bar */}
          <div className="flex h-10 rounded-xl overflow-hidden gap-px">
            {dev.slots.map((s: any) => (
              <div
                key={s.time}
                onClick={() => handleSlotClick(dev.id, s)}
                className={`flex-1 cursor-pointer transition-colors ${
                  s.maintenance ? "bg-gray-200 cursor-not-allowed" :
                  s.isMy ? "bg-blue-400" :
                  s.available ? "bg-green-200 hover:bg-orange-200" :
                  "bg-red-300"
                }`}
                title={`${s.time}${s.bookedBy ? ` - ${s.bookedBy}` : s.available ? " 可预约" : " 维护中"}`}
              />
            ))}
          </div>

          {/* Hour labels */}
          <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0">
            {[6, 8, 10, 12, 14, 16, 18, 20, 22].map(h => (
              <span key={h}>{h}</span>
            ))}
          </div>

          {/* Booking tags */}
          {dev.todayBookings.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {dev.todayBookings.map((b: any) => (
                <span key={b.id} className={`text-xs px-2 py-0.5 rounded ${b.wechat_name === wechatName ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                  {b.start_time}-{b.end_time} {b.wechat_name === wechatName ? "我" : `@${b.wechat_name}`}
                </span>
              ))}
            </div>
          )}
          {dev.todayBookings.length === 0 && (
            <div className="text-xs text-gray-400 mt-3">今日暂无预约</div>
          )}
        </div>
      ))}
    </div>
  );
}

function MonthCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [d, month, year] = [new Date(value).getDate(), new Date(value).getMonth(), new Date(value).getFullYear()];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    const nm = month === 0 ? 11 : month - 1;
    const ny = month === 0 ? year - 1 : year;
    onChange(formatDate(new Date(ny, nm, 1)));
  };
  const nextMonth = () => {
    const nm = month === 11 ? 0 : month + 1;
    const ny = month === 11 ? year + 1 : year;
    onChange(formatDate(new Date(ny, nm, 1)));
  };

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekDays = ["日","一","二","三","四","五","六"];

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="text-sm text-gray-400">⟨</button>
        <span className="text-sm font-medium">{year}年{month + 1}月</span>
        <button onClick={nextMonth} className="text-sm text-gray-400">⟩</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekDays.map(w => <div key={w} className="text-[10px] text-gray-400">{w}</div>)}
        {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
        {days.map(day => {
          const ds = formatDate(new Date(year, month, day));
          const isToday = ds === formatDate(new Date());
          const isSelected = ds === value;
          return (
            <button
              key={day}
              onClick={() => onChange(ds)}
              className={`text-xs py-1 rounded ${
                isSelected ? "bg-orange-500 text-white" :
                isToday ? "border border-orange-300 text-orange-600" :
                "text-gray-600 hover:bg-gray-100"
              }`}
            >{day}</button>
          );
        })}
      </div>
    </div>
  );
}
