'use client';

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [tab, setTab] = useState("bookings");
  const [isAdmin, setIsAdmin] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [config, setConfig] = useState({ max_duration: "2", max_daily: "2", booking_window: "7", slot_minutes: "30" });
  const [banModal, setBanModal] = useState({ show: false, id: "", name: "", type: 1, days: 3 });

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/auth/login"); return; }
    const { data: profile } = await supabase.from("kitchen_profiles").select("role").eq("id", user.id).single();
    if (profile?.role === 1) {
      setIsAdmin(true);
      loadData("bookings");
      loadData("users");
      loadData("devices");
    } else {
      router.push("/");
    }
  }

  async function loadData(type: string) {
    const supabase = createClient();
    if (type === "bookings") {
      const { data } = await supabase
        .from("kitchen_bookings")
        .select("*, kitchen_devices!inner(name), kitchen_profiles!inner(nickname)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) {
        setBookings(data.map((b: any) => ({
          ...b, deviceName: b.kitchen_devices?.name, nickname: b.kitchen_profiles?.nickname,
          statusText: ({ 1: "预约中", 2: "已取消", 3: "管理员取消" } as Record<number, string>)[b.status] || "未知"
        })));
      }
    }
    if (type === "users") {
      const { data } = await supabase.from("kitchen_profiles").select("*").order("created_at");
      if (data) setUsers(data);
    }
    if (type === "devices") {
      const { data } = await supabase.from("kitchen_devices").select("*").order("sort_order");
      if (data) setDevices(data);
    }
    const { data: cfg } = await supabase.from("kitchen_configs").select("*");
    if (cfg) {
      const c: any = {};
      cfg.forEach((r: any) => { c[r.key] = r.value; });
      setConfig({ ...config, ...c });
    }
  }

  async function forceCancel(id: string) {
    if (!confirm("确定强制取消此预约？")) return;
    await supabase.from("kitchen_bookings").update({ status: 3, updated_at: new Date().toISOString() }).eq("id", id);
    loadData("bookings");
  }

  async function banUser() {
    const { data: { user } } = await supabase.auth.getUser();
    const update: any = { ban_status: banModal.type };
    if (banModal.type === 1) {
      const until = new Date();
      until.setDate(until.getDate() + banModal.days);
      update.ban_until = until.toISOString();
    }
    await supabase.from("kitchen_profiles").update(update).eq("id", banModal.id);
    await supabase.rpc("log_admin_action", { p_admin_id: user?.id, p_action: "ban_user", p_target_id: banModal.id, p_detail: JSON.stringify(banModal) });
    setBanModal({ show: false, id: "", name: "", type: 1, days: 3 });
    loadData("users");
  }

  async function unbanUser(id: string) {
    await supabase.from("kitchen_profiles").update({ ban_status: 0, ban_until: null }).eq("id", id);
    loadData("users");
  }

  async function toggleMaintenance(devId: string, currentStatus: number) {
    const newStatus = currentStatus === 1 ? 0 : 1;
    if (newStatus === 0 && !confirm("标记为维护中？同时取消该设备所有未来预约？")) return;
    await supabase.from("kitchen_devices").update({ status: newStatus }).eq("id", devId);
    if (newStatus === 0) {
      await supabase.from("kitchen_bookings").update({ status: 3, updated_at: new Date().toISOString() }).eq("device_id", devId).gte("date", new Date().toISOString().split("T")[0]).eq("status", 1);
    }
    loadData("devices");
  }

  async function saveConfig() {
    for (const [key, value] of Object.entries(config)) {
      const { data: existing } = await supabase.from("kitchen_configs").select("id").eq("key", key).single();
      if (existing) {
        await supabase.from("kitchen_configs").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      } else {
        await supabase.from("kitchen_configs").insert({ key, value });
      }
    }
    alert("配置已保存");
  }

  if (!isAdmin) return <div className="flex min-h-screen items-center justify-center text-gray-400">加载中...</div>;

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">管理后台</h1>
        <button onClick={() => router.push("/")} className="text-sm text-gray-500">← 首页</button>
      </div>

      <div className="flex border-b mb-4">
        {["bookings", "users", "devices", "config"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 pb-2 text-sm text-center ${tab === t ? "text-orange-500 border-b-2 border-orange-500 font-medium" : "text-gray-500"}`}>
            {{ bookings: "预约", users: "用户", devices: "设备", config: "配置" }[t]}
          </button>
        ))}
      </div>

      {tab === "bookings" && bookings.map((b) => (
        <div key={b.id} className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium">{b.deviceName}</p>
              <p className="text-xs text-gray-500">{b.nickname} | {b.date} {b.start_time}-{b.end_time}</p>
            </div>
            <span className="text-xs text-gray-400">{b.statusText}</span>
          </div>
          {b.status === 1 && <button onClick={() => forceCancel(b.id)} className="mt-2 text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1">强制取消</button>}
        </div>
      ))}

      {tab === "users" && users.map((u) => (
        <div key={u.id} className="bg-white rounded-2xl p-4 mb-3 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm">{u.nickname?.[0] || "?"}</div>
          <div className="flex-1">
            <p className="font-medium text-sm">{u.nickname || "未知"}</p>
            {u.ban_status > 0 && <p className="text-xs text-red-500">{u.ban_status === 1 ? `封禁至 ${u.ban_until?.split("T")[0]}` : "永久封禁"}</p>}
          </div>
          {u.role !== 1 && (
            u.ban_status > 0
              ? <button onClick={() => unbanUser(u.id)} className="text-xs text-orange-500 border border-orange-200 rounded-lg px-3 py-1">解封</button>
              : <button onClick={() => setBanModal({ show: true, id: u.id, name: u.nickname, type: 1, days: 3 })} className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1">封禁</button>
          )}
        </div>
      ))}

      {tab === "devices" && devices.map((d) => (
        <div key={d.id} className="bg-white rounded-2xl p-4 mb-3 shadow-sm flex items-center justify-between">
          <div>
            <p className="font-medium">{d.name}</p>
            <p className="text-xs text-gray-400">{d.description}</p>
          </div>
          <button onClick={() => toggleMaintenance(d.id, d.status)} className={`text-xs rounded-lg px-3 py-1 border ${d.status === 1 ? "text-red-500 border-red-200" : "text-green-600 border-green-300"}`}>
            {d.status === 1 ? "标记维护" : "恢复可用"}
          </button>
        </div>
      ))}

      {tab === "config" && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          {[
            { key: "max_duration", label: "单次最大时长（小时）" },
            { key: "max_daily", label: "单日最大预约次数" },
            { key: "booking_window", label: "预约窗口（天）" },
            { key: "slot_minutes", label: "时段粒度（分钟）" },
          ].map(({ key, label }) => (
            <div key={key} className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">{label}</label>
              <input
                value={(config as any)[key]}
                onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
          ))}
          <button onClick={saveConfig} className="w-full bg-orange-500 text-white rounded-xl py-2.5 text-sm mt-2">保存配置</button>
        </div>
      )}

      {banModal.show && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setBanModal({ ...banModal, show: false })}>
          <div className="bg-white rounded-2xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">封禁用户：{banModal.name}</h3>
            <div className="flex gap-3 mb-4">
              <button onClick={() => setBanModal({ ...banModal, type: 1 })} className={`flex-1 py-2 rounded-lg text-sm border ${banModal.type === 1 ? "bg-red-50 text-red-500 border-red-300" : "border-gray-200 text-gray-500"}`}>临时</button>
              <button onClick={() => setBanModal({ ...banModal, type: 2 })} className={`flex-1 py-2 rounded-lg text-sm border ${banModal.type === 2 ? "bg-red-50 text-red-500 border-red-300" : "border-gray-200 text-gray-500"}`}>永久</button>
            </div>
            {banModal.type === 1 && (
              <input type="number" value={banModal.days} onChange={(e) => setBanModal({ ...banModal, days: Number(e.target.value) || 1 })} className="w-full border rounded-xl px-3 py-2 text-sm mb-4" placeholder="封禁天数" />
            )}
            <div className="flex gap-3">
              <button onClick={() => setBanModal({ ...banModal, show: false })} className="flex-1 py-2 text-sm border rounded-xl">取消</button>
              <button onClick={banUser} className="flex-1 py-2 text-sm bg-red-500 text-white rounded-xl">确认封禁</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
