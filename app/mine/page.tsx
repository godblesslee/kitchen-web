'use client';

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function MinePage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) { router.replace("/auth/login"); return; }
      loadBookings(data.user.id);
    });
  }, []);

  async function loadBookings(userId: string) {
    const { data } = await supabase
      .from("kitchen_bookings")
      .select("*, kitchen_devices!inner(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      const enriched = data.map((b: any) => {
        const now = new Date();
        const bStart = new Date(`${b.date}T${b.start_time}`);
        const bEnd = new Date(`${b.date}T${b.end_time}`);

        let displayStatus = "expired";
        let displayStatusText = "已结束";
        if (b.status === 2) { displayStatus = "canceled"; displayStatusText = "已取消"; }
        else if (b.status === 3) { displayStatus = "canceled"; displayStatusText = "管理员取消"; }
        else if (bStart > now) { displayStatus = "upcoming"; displayStatusText = "即将开始"; }
        else if (bEnd > now) { displayStatus = "active"; displayStatusText = "使用中"; }
        return { ...b, displayStatus, displayStatusText, deviceName: b.kitchen_devices?.name || "设备" };
      });
      setBookings(enriched);
    }
    setLoading(false);
  }

  async function handleCancel(id: string) {
    if (!confirm("确定取消此预约？")) return;
    await supabase.from("kitchen_bookings").update({ status: 2, updated_at: new Date().toISOString() }).eq("id", id);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) loadBookings(user.id);
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-gray-400">加载中...</div>;

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">我的预约</h1>
        <button onClick={() => router.push("/")} className="text-sm text-gray-500">← 首页</button>
      </div>

      {bookings.length === 0 && <div className="text-center text-gray-400 py-20">暂无预约记录</div>}

      {bookings.map((b) => (
        <div key={b.id} className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{b.deviceName}</h3>
              <p className="text-gray-400 text-sm">{b.date}</p>
              <p className="text-orange-600 font-semibold text-lg mt-1">{b.start_time} - {b.end_time}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs ${
              b.displayStatus === "upcoming" ? "bg-blue-50 text-blue-600" :
              b.displayStatus === "active" ? "bg-green-50 text-green-600" :
              b.displayStatus === "canceled" ? "bg-red-50 text-red-500" :
              "bg-gray-50 text-gray-500"
            }`}>{b.displayStatusText}</span>
          </div>
          {b.status === 1 && new Date(`${b.date}T${b.start_time}`) > new Date() && (
            <button onClick={() => handleCancel(b.id)} className="mt-3 text-sm text-red-500 border border-red-200 rounded-xl px-4 py-1.5">取消预约</button>
          )}
        </div>
      ))}
    </div>
  );
}
