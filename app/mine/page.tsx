'use client';

import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function dateLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${date} · ${week}`;
}
function displayTime(t: string): string { return t.slice(0, 5); }
function deviceSortValue(booking: any): string {
  const sortOrder = booking.kitchen_devices?.sort_order ?? 999;
  return `${String(sortOrder).padStart(4, "0")}-${booking.deviceName || ""}`;
}

export default function MinePage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wechatName, setWechatName] = useState("");
  const router = useRouter();

  const groupedBookings = useMemo(() => {
    const groups = new Map<string, any[]>();
    bookings.forEach(b => {
      const list = groups.get(b.date) || [];
      list.push(b);
      groups.set(b.date, list);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) =>
          deviceSortValue(a).localeCompare(deviceSortValue(b)) ||
          a.start_time.localeCompare(b.start_time)
        ),
      }));
  }, [bookings]);

  useEffect(() => {
    const name = localStorage.getItem("kitchen_wechat_name");
    if (!name) { router.replace("/"); return; }
    setWechatName(name);
    loadBookings(name);
  }, []);

  async function loadBookings(name: string) {
    const { data } = await supabase
      .from("kitchen_bookings")
      .select("*, kitchen_devices!inner(name, sort_order)")
      .eq("wechat_name", name)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setBookings(data.map((b: any) => {
        const now = new Date();
        const bStart = new Date(`${b.date}T${b.start_time}`);
        const bEnd = new Date(`${b.date}T${b.end_time}`);
        let status = "expired", text = "已结束";
        if (b.status === 2) { status = "canceled"; text = "已取消"; }
        else if (b.status === 3) { status = "canceled"; text = "管理员取消"; }
        else if (bStart > now) { status = "upcoming"; text = "即将开始"; }
        else if (bEnd > now) { status = "active"; text = "使用中"; }
        return { ...b, displayStatus: status, displayStatusText: text, deviceName: b.kitchen_devices?.name };
      }));
    }
    setLoading(false);
  }

  async function handleCancel(id: string) {
    if (!confirm("确定取消此预约？")) return;
    await supabase.from("kitchen_bookings").update({ status: 2, updated_at: new Date().toISOString() }).eq("id", id);
    loadBookings(wechatName);
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-gray-400">加载中...</div>;

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">我的预约</h1>
        <button onClick={() => router.push("/")} className="text-sm text-gray-500">← 首页</button>
      </div>
      {bookings.length === 0 && <div className="text-center text-gray-400 py-20">暂无预约记录</div>}
      {groupedBookings.map(group => (
        <section key={group.date} className="mb-5">
          <div className="sticky top-0 z-10 -mx-4 bg-[#f7f4ef]/95 px-4 py-2 backdrop-blur">
            <h2 className="text-sm font-semibold text-[#5f594f]">{dateLabel(group.date)}</h2>
          </div>
          <div className="space-y-3">
            {group.items.map(b => (
              <div key={b.id} className="bg-white rounded-2xl p-4 shadow-sm border border-[#eee7df]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{b.deviceName}</h3>
                    <p className="text-[#c86b3c] font-semibold text-lg mt-1">{displayTime(b.start_time)} - {displayTime(b.end_time)}</p>
                  </div>
                  <span className={`shrink-0 px-3 py-1 rounded-full text-xs ${
                    b.displayStatus === "upcoming" ? "bg-[#d8e0e4] text-[#425e6b]" :
                    b.displayStatus === "active" ? "bg-[#dde7d6] text-[#4f6b45]" :
                    b.displayStatus === "canceled" ? "bg-[#e8d1c3] text-[#8a513b]" : "bg-[#e2e0da] text-[#6b6860]"
                  }`}>{b.displayStatusText}</span>
                </div>
                {b.status === 1 && new Date(`${b.date}T${b.start_time}`) > new Date() && (
                  <button onClick={() => handleCancel(b.id)} className="mt-3 min-h-10 text-sm text-[#8a513b] border border-[#e8d1c3] rounded-xl px-4 py-1.5">取消预约</button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
