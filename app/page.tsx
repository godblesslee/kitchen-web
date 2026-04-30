'use client';

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Device, Booking, Profile } from "@/lib/types";

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr(): string {
  return formatDate(new Date());
}

export default function HomePage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { router.replace("/auth/login"); return; }
      const supabase = createClient();
      const { data: profile } = await supabase
        .from("kitchen_profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();
      setUser(profile);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    loadDevices();
  }, [selectedDate]);

  async function loadDevices() {
    const supabase = createClient();
    const { data: devicesData } = await supabase
      .from("kitchen_devices")
      .select("*")
      .order("sort_order");

    if (!devicesData) return;

    const enriched = await Promise.all(
      devicesData.map(async (d) => {
        const { data: bks } = await supabase
          .from("kitchen_bookings")
          .select("*")
          .eq("device_id", d.id)
          .eq("date", selectedDate)
          .eq("status", 1);
        return { ...d, todayBookings: bks || [] };
      })
    );
    setDevices(enriched);
  }

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/auth/login");
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-gray-400">加载中...</div>;
  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">创意厨房</h1>
        <div className="flex items-center gap-3">
          {user.role === 1 && (
            <button onClick={() => router.push("/admin")} className="text-sm text-orange-500">管理</button>
          )}
          <button onClick={() => router.push("/mine")} className="text-sm text-gray-500">我的</button>
          <button onClick={handleLogout} className="text-sm text-gray-400">退出</button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 mb-4">
        <button onClick={() => {
          const d = new Date(selectedDate);
          d.setDate(d.getDate() - 1);
          setSelectedDate(formatDate(d));
        }} className="text-orange-500 text-lg">◀</button>
        <span className="font-semibold">{selectedDate}</span>
        <button onClick={() => {
          const d = new Date(selectedDate);
          d.setDate(d.getDate() + 1);
          const max = new Date(); max.setDate(max.getDate() + 6);
          if (d <= max) setSelectedDate(formatDate(d));
        }} className={`text-lg ${new Date(selectedDate) < new Date(new Date().setDate(new Date().getDate() + 6)) ? "text-orange-500" : "text-gray-300"}`}>▶</button>
      </div>

      {devices.map((d) => (
        <div key={d.id} className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg">{d.name}</h3>
              <p className="text-gray-400 text-sm">{d.description}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs ${d.status === 1 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
              {d.status === 1 ? "可用" : "维护中"}
            </span>
          </div>
          {d.status === 1 && (
            <div className="mt-3">
              <div className="flex flex-wrap gap-2 mb-3">
                {d.todayBookings.map((b: any) => (
                  <span key={b.id} className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded">{b.start_time}-{b.end_time}</span>
                ))}
                {d.todayBookings.length === 0 && <span className="text-xs text-gray-400">今日暂无预约</span>}
              </div>
              <button
                onClick={() => router.push(`/booking?deviceId=${d.id}&date=${selectedDate}`)}
                className="w-full bg-orange-500 text-white rounded-xl py-2.5 text-sm font-medium"
              >立即预约</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
