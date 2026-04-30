'use client';

import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useState } from "react";

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeToMin(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minToTime(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
function displayTime(t: string): string { return t.slice(0, 5); }
function nextBookableMinute(slotMinutes: number): number {
  const now = new Date();
  return Math.ceil((now.getHours() * 60 + now.getMinutes()) / slotMinutes) * slotMinutes;
}

const STORAGE_KEY = "kitchen_wechat_name";
const START_HOUR = 6;
const LATEST_START_HOUR = 22;
const END_HOUR = 24;
const SLOT_MINUTES = 30;

export default function HomePage() {
  const [wechatName, setWechatName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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
    setLoadError("");
    try {
      const [{ data: devs, error: devError }, { data: bks, error: bookingError }] = await Promise.all([
        supabase.from("kitchen_devices").select("*").order("sort_order"),
        supabase.from("kitchen_bookings").select("*").eq("date", selectedDate).eq("status", 1),
      ]);
      if (devError || bookingError) throw devError || bookingError;
      const enriched = devs.map(d => ({
        ...d,
        slots: buildSlots(d, bks || [], wechatName),
        todayBookings: (bks || []).filter((b: any) => b.device_id === d.id)
      }));
      setDevices(enriched);
    } catch (error) {
      setDevices([]);
      setLoadError(error instanceof Error ? error.message : "加载失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }

  function buildSlots(device: any, bookings: any[], myName: string) {
    const slots = [];
    const today = formatDate(new Date());
    const isPastDate = selectedDate < today;
    const isToday = selectedDate === today;
    const cutoff = isToday ? nextBookableMinute(SLOT_MINUTES) : 0;
    for (let minute = START_HOUR * 60; minute < END_HOUR * 60; minute += SLOT_MINUTES) {
      const time = minToTime(minute);
      const bk = bookings.find((b: any) =>
        b.device_id === device.id && timeToMin(b.start_time) <= minute && timeToMin(b.end_time) > minute
      );
      const past = isPastDate || (isToday && minute < cutoff);
      const afterLatestStart = minute > LATEST_START_HOUR * 60;
      slots.push({
        time,
        available: !past && !afterLatestStart && !bk && device.status === 1,
        bookedBy: bk?.wechat_name || "",
        isMy: bk?.wechat_name === myName,
        maintenance: device.status === 0,
        past,
        afterLatestStart,
        bookingStart: bk ? minute === timeToMin(bk.start_time) : false,
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
    if (editingName) alert("微信名已修改。已有预约记录仍保留原名称，不会自动改名。");
    setEditingName(false);
  }

  function changeDate(dir: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir);
    setSelectedDate(formatDate(d));
  }

  function bookingUrl(deviceId: string, slot?: any) {
    const params = new URLSearchParams({ deviceId, date: selectedDate });
    if (slot?.available) params.set("start", slot.time);
    return `/booking?${params.toString()}`;
  }

  function handleBookClick(deviceId: string) {
    router.push(bookingUrl(deviceId));
  }

  function handleSlotClick(deviceId: string, slot: any) {
    router.push(bookingUrl(deviceId, slot));
  }

  function handleTimelineClick(deviceId: string, slots: any[], event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.min(slots.length - 1, Math.max(0, Math.floor(ratio * slots.length)));
    handleSlotClick(deviceId, slots[index]);
  }

  function handleEditName() {
    setNameInput(wechatName);
    setEditingName(true);
    setMenuOpen(false);
    setShowNameModal(true);
  }

  function canCancelBooking(booking: any) {
    return booking.wechat_name === wechatName && new Date(`${booking.date}T${booking.start_time}`) > new Date();
  }

  async function handleCancelBooking(id: string) {
    if (!confirm("确定取消这个预约？")) return;
    await supabase.from("kitchen_bookings").update({ status: 2, updated_at: new Date().toISOString() }).eq("id", id);
    loadData();
  }

  if (showNameModal) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 bg-[#f7f4ef]">
        <div className="bg-white rounded-2xl p-8 shadow-sm w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🍳</div>
            <h1 className="text-2xl font-bold">{editingName ? "修改微信名" : "创意厨房预约"}</h1>
            {editingName && (
              <p className="mt-2 text-xs leading-relaxed text-[#8a8176]">
                这里只修改本机当前使用的名称；已有预约记录仍保留原名称，不会自动改名。
              </p>
            )}
          </div>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveName()}
            placeholder="输入你在社区在地群的微信名称"
            className="w-full border border-[#ded7ce] rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:border-[#c86b3c]"
            autoFocus
          />
          <button onClick={saveName} disabled={!nameInput.trim()} className="w-full bg-[#c86b3c] text-white rounded-xl py-3 font-medium disabled:opacity-40">
            {editingName ? "保存修改" : "确认"}
          </button>
          {editingName && (
            <button
              onClick={() => { setEditingName(false); setShowNameModal(false); setNameInput(""); }}
              className="mt-2 w-full py-3 text-sm text-[#8a8176]"
            >
              取消
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">创意厨房</h1>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="min-h-11 min-w-11 rounded-full bg-white px-3 text-sm text-[#5f594f] shadow-sm border border-[#ebe4dc] active:scale-[0.98]"
            aria-label="打开用户菜单"
          >
            @{wechatName.slice(0, 4) || "我"}
          </button>
          {menuOpen && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} aria-label="关闭菜单" />
              <div className="absolute right-0 top-12 z-20 w-40 overflow-hidden rounded-xl border border-[#ebe4dc] bg-white shadow-lg">
                <button onClick={() => router.push("/mine")} className="block min-h-11 w-full px-4 text-left text-sm text-[#332f2a] active:bg-[#f7f4ef]">我的预约</button>
                <button onClick={() => router.push("/rules")} className="block min-h-11 w-full px-4 text-left text-sm text-[#332f2a] active:bg-[#f7f4ef]">使用规则</button>
                {isAdmin && (
                  <button onClick={() => router.push("/admin")} className="block min-h-11 w-full px-4 text-left text-sm text-[#c86b3c] active:bg-[#f7f4ef]">管理后台</button>
                )}
                <button onClick={handleEditName} className="block min-h-11 w-full border-t border-[#f0ebe5] px-4 text-left text-sm text-[#8a8176] active:bg-[#f7f4ef]">修改微信名</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Date selector */}
      <div className="flex items-center justify-center gap-6 mb-2">
        <button onClick={() => changeDate(-1)} className="min-h-11 min-w-11 text-[#c86b3c] text-lg">◀</button>
        <span className="font-semibold">{selectedDate}</span>
        <button onClick={() => changeDate(1)} className="min-h-11 min-w-11 text-[#c86b3c] text-lg">▶</button>
      </div>

      {/* Mini calendar */}
      <MonthCalendar value={selectedDate} onChange={setSelectedDate} />

      {loading && <div className="text-center text-gray-400 py-10">加载中...</div>}
      {!loading && loadError && (
        <div className="rounded-2xl bg-white p-4 text-center text-sm text-[#8a513b] shadow-sm">
          <p>{loadError}</p>
          <button onClick={loadData} className="mt-3 min-h-11 rounded-xl bg-[#c86b3c] px-4 text-white">重新加载</button>
        </div>
      )}

      {/* Device timelines */}
      {devices.map(dev => (
        <div key={dev.id} className="mb-4 bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">{dev.name}</span>
            <div className="flex items-center gap-2">
              {dev.status !== 1 && (
                <span className="rounded-full bg-[#e2e0da] px-2 py-0.5 text-xs text-[#6b6860]">
                  维护中
                </span>
              )}
              <button
                onClick={() => handleBookClick(dev.id)}
                className="min-h-8 rounded-full border border-[#e7cbbd] bg-white px-3 text-xs font-medium text-[#8a513b] active:scale-[0.98] active:bg-[#f7f4ef]"
              >
                预约 ›
              </button>
            </div>
          </div>

          <div className="mb-1 flex justify-end">
            <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1 text-[10px] text-[#8a8176]">
              <LegendItem color="bg-[#dde7d6]" label="可预约" />
              <LegendItem color="bg-[#e8d1c3]" label="已预约" />
              <LegendItem color="bg-[#d8e0e4]" label="我的预约" />
              <LegendItem color="bg-[#e2e0da]" label="不可用" />
            </div>
          </div>

          {/* Timeline bar */}
          <div
            onClick={(event) => handleTimelineClick(dev.id, dev.slots, event)}
            className="flex h-12 cursor-pointer overflow-hidden rounded-xl gap-px"
          >
            {dev.slots.map((s: any) => (
              <div
                key={s.time}
                className={`pointer-events-none flex-1 transition-colors ${
                  s.past ? "bg-[#e2e0da] cursor-not-allowed" :
                  s.maintenance ? "bg-[#e2e0da] cursor-not-allowed" :
                  s.isMy ? "bg-[#d8e0e4]" :
                  s.afterLatestStart ? "bg-[#dde7d6] cursor-not-allowed" :
                  s.available ? "bg-[#dde7d6] hover:bg-[#f4e7de]" :
                  "bg-[#e8d1c3]"
                }`}
                title={`${s.time}${s.past ? " 已过" : s.afterLatestStart ? " 仅可作为结束时间" : s.bookedBy ? ` - ${s.bookedBy}` : s.available ? " 可预约" : " 维护中"}`}
              />
            ))}
          </div>

          {/* Hour labels */}
          <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0">
            {[6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map(h => (
              <span key={h}>{h}</span>
            ))}
          </div>

          {/* Booking tags */}
          {dev.todayBookings.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {dev.todayBookings.map((b: any) => {
                const canCancel = canCancelBooking(b);
                return (
                  <div key={b.id} className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${b.wechat_name === wechatName ? "bg-[#d8e0e4] text-[#425e6b]" : "bg-[#e8d1c3] text-[#8a513b]"}`}>
                    <span>{displayTime(b.start_time)}-{displayTime(b.end_time)} {b.wechat_name === wechatName ? "我" : `@${b.wechat_name}`}</span>
                    {canCancel && (
                      <button onClick={() => handleCancelBooking(b.id)} className="ml-1 min-h-6 rounded bg-white/70 px-1.5 text-[10px] text-[#8a513b]">
                        取消
                      </button>
                    )}
                  </div>
                );
              })}
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

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function MonthCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [month, year] = [new Date(value).getMonth(), new Date(value).getFullYear()];
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
        <button onClick={prevMonth} className="min-h-9 min-w-9 text-sm text-gray-400">⟨</button>
        <span className="text-sm font-medium">{year}年{month + 1}月</span>
        <button onClick={nextMonth} className="min-h-9 min-w-9 text-sm text-gray-400">⟩</button>
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
                isSelected ? "bg-[#c86b3c] text-white" :
                isToday ? "border border-[#c86b3c] text-[#c86b3c]" :
                "text-gray-600 hover:bg-gray-100"
              }`}
            >{day}</button>
          );
        })}
      </div>
    </div>
  );
}
