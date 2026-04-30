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

export default function AdminPage() {
  const [tab, setTab] = useState("bookings");
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [bookings, setBookings] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [config, setConfig] = useState({
    max_duration: "2",
    max_daily: "2",
    booking_window: "7",
    slot_minutes: "30",
    start_hour: "6",
    end_hour: "24",
  });
  const [banModal, setBanModal] = useState({ show: false, name: "", type: 1, days: 3 });

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
          a.start_time.localeCompare(b.start_time) ||
          String(a.wechat_name || "").localeCompare(String(b.wechat_name || ""))
        ),
      }));
  }, [bookings]);

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    const saved = localStorage.getItem("kitchen_admin");
    if (saved === "true") {
      setAuthorized(true);
      loadAllData();
    }
  }

  async function loadAllData() {
    loadBookings();
    loadUsers();
    loadDevices();
    loadConfig();
  }

  async function loadBookings() {
    const { data } = await supabase
      .from("kitchen_bookings").select("*, kitchen_devices!inner(name, sort_order)")
      .order("created_at", { ascending: false }).limit(100);
    if (data) setBookings(data.map((b: any) => ({
      ...b, deviceName: b.kitchen_devices?.name,
      statusText: ({ 1: "预约中", 2: "已取消", 3: "管理员取消" } as Record<number, string>)[b.status] || "未知"
    })));
  }

  async function loadUsers() {
    const { data } = await supabase.from("kitchen_profiles").select("*").order("created_at");
    // Also get unique wechat names from bookings
    const { data: bkNames } = await supabase.from("kitchen_bookings").select("wechat_name");
    const nameSet = new Set<string>();
    (bkNames || []).forEach((b: any) => { if (b.wechat_name) nameSet.add(b.wechat_name); });
    // Merge with profiles
    const profileNames = new Set((data || []).map((p: any) => p.nickname));
    nameSet.forEach(n => profileNames.add(n));

    const allUsers = Array.from(profileNames).map(name => {
      const profile = (data || []).find((p: any) => p.nickname === name);
      return {
        nickname: name,
        ban_status: profile?.ban_status || 0,
        ban_until: profile?.ban_until || null,
        role: profile?.role || 0,
        id: profile?.id || name
      };
    });
    setUsers(allUsers);
  }

  async function loadDevices() {
    const { data } = await supabase.from("kitchen_devices").select("*").order("sort_order");
    if (data) setDevices(data);
  }

  async function loadConfig() {
    const { data } = await supabase.from("kitchen_configs").select("*");
    if (data) {
      const c: any = {};
      data.forEach((r: any) => { c[r.key] = r.value; });
      if (Number(c.end_hour) < 24) c.end_hour = "24";
      setConfig({ ...config, ...c });
    }
  }

  async function handleLogin() {
    setPasswordError("");
    const { data } = await supabase.from("kitchen_configs").select("value").eq("key", "admin_password").single();
    if (data?.value === passwordInput) {
      localStorage.setItem("kitchen_admin", "true");
      setAuthorized(true);
      loadAllData();
    } else {
      setPasswordError("密码错误");
    }
  }

  async function forceCancel(id: string) {
    if (!confirm("确定强制取消此预约？")) return;
    await supabase.from("kitchen_bookings").update({ status: 3, updated_at: new Date().toISOString() }).eq("id", id);
    loadBookings();
  }

  async function banUser() {
    const existing = await supabase.from("kitchen_profiles").select("*").eq("nickname", banModal.name).single();
    const update: any = { ban_status: banModal.type };
    if (banModal.type === 1) {
      const until = new Date();
      until.setDate(until.getDate() + banModal.days);
      update.ban_until = until.toISOString();
    } else {
      update.ban_until = null;
    }
    if (existing.data) {
      await supabase.from("kitchen_profiles").update(update).eq("nickname", banModal.name);
    } else {
      await supabase.from("kitchen_profiles").insert({ id: crypto.randomUUID(), nickname: banModal.name, ...update, role: 0 });
    }
    setBanModal({ show: false, name: "", type: 1, days: 3 });
    loadUsers();
  }

  async function unbanUser(name: string) {
    await supabase.from("kitchen_profiles").update({ ban_status: 0, ban_until: null }).eq("nickname", name);
    loadUsers();
  }

  async function toggleMaintenance(devId: string, currentStatus: number) {
    const newStatus = currentStatus === 1 ? 0 : 1;
    if (newStatus === 0 && !confirm("标记为维护中？将同时取消该设备所有未来预约？")) return;
    await supabase.from("kitchen_devices").update({ status: newStatus }).eq("id", devId);
    if (newStatus === 0) {
      await supabase.from("kitchen_bookings").update({ status: 3, updated_at: new Date().toISOString() })
        .eq("device_id", devId).gte("date", new Date().toISOString().split("T")[0]).eq("status", 1);
    }
    loadDevices();
  }

  async function saveConfig() {
    for (const [key, value] of Object.entries(config)) {
      const { data: ex } = await supabase.from("kitchen_configs").select("key").eq("key", key).single();
      if (ex) {
        await supabase.from("kitchen_configs").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      } else {
        await supabase.from("kitchen_configs").insert({ key, value });
      }
    }
    alert("配置已保存");
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 bg-amber-50">
        <div className="bg-white rounded-2xl p-8 shadow-sm w-full max-w-sm">
          <h2 className="text-lg font-bold mb-4">管理员登录</h2>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="输入管理密码"
            className="w-full border rounded-xl px-4 py-3 text-sm mb-3"
            autoFocus
          />
          {passwordError && <p className="text-red-500 text-xs mb-3">{passwordError}</p>}
          <button onClick={handleLogin} className="w-full bg-orange-500 text-white rounded-xl py-3 font-medium">确认</button>
          <button onClick={() => router.push("/")} className="w-full text-gray-400 text-sm py-3">← 返回首页</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">管理后台</h1>
        <button onClick={() => { localStorage.removeItem("kitchen_admin"); setAuthorized(false); }} className="text-sm text-gray-400">退出</button>
      </div>

      <div className="flex border-b mb-4">
        {["bookings", "users", "devices", "config"].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 pb-2 text-sm text-center ${tab === t ? "text-orange-500 border-b-2 border-orange-500 font-medium" : "text-gray-500"}`}>
            {{ bookings: "预约", users: "用户", devices: "设备", config: "配置" }[t]}
          </button>
        ))}
      </div>

      {tab === "bookings" && (
        bookings.length === 0
          ? <div className="text-center text-gray-400 py-20">暂无预约记录</div>
          : groupedBookings.map(group => (
            <section key={group.date} className="mb-5">
              <div className="sticky top-0 z-10 -mx-4 bg-[#f7f4ef]/95 px-4 py-2 backdrop-blur">
                <h2 className="text-sm font-semibold text-[#5f594f]">{dateLabel(group.date)}</h2>
              </div>
              <div className="space-y-3">
                {group.items.map(b => (
                  <div key={b.id} className="bg-white rounded-2xl p-4 shadow-sm border border-[#eee7df]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{b.deviceName}</p>
                        <p className="text-xs text-gray-500">@{b.wechat_name || "未填写"} · {displayTime(b.start_time)}-{displayTime(b.end_time)}</p>
                      </div>
                      <span className={`shrink-0 px-3 py-1 rounded-full text-xs ${
                        b.status === 1 ? "bg-[#d8e0e4] text-[#425e6b]" :
                        b.status === 2 ? "bg-[#e8d1c3] text-[#8a513b]" :
                        "bg-[#e2e0da] text-[#6b6860]"
                      }`}>{b.statusText}</span>
                    </div>
                    {b.status === 1 && (
                      <button onClick={() => forceCancel(b.id)} className="mt-3 min-h-10 text-sm text-red-500 border border-red-200 rounded-xl px-4 py-1.5">强制取消</button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))
      )}

      {tab === "users" && users.map((u, i) => (
        <div key={i} className="bg-white rounded-2xl p-4 mb-3 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm">{u.nickname?.[0] || "?"}</div>
          <div className="flex-1"><p className="font-medium text-sm">@{u.nickname}</p>
            {u.ban_status > 0 && <p className="text-xs text-red-500">{u.ban_status === 1 ? `封禁至 ${u.ban_until?.split("T")[0]}` : "永久封禁"}</p>}</div>
          {u.role !== 1 && (
            u.ban_status > 0
              ? <button onClick={() => unbanUser(u.nickname)} className="text-xs text-orange-500 border border-orange-200 rounded-lg px-3 py-1">解封</button>
              : <button onClick={() => setBanModal({ show: true, name: u.nickname, type: 1, days: 3 })} className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1">封禁</button>
          )}
        </div>
      ))}

      {tab === "devices" && devices.map(d => (
        <div key={d.id} className="bg-white rounded-2xl p-4 mb-3 shadow-sm flex items-center justify-between">
          <div><p className="font-medium">{d.name}</p><p className="text-xs text-gray-400">{d.description}</p></div>
          <button onClick={() => toggleMaintenance(d.id, d.status)} className={`text-xs rounded-lg px-3 py-1 border ${d.status === 1 ? "text-red-500 border-red-200" : "text-green-600 border-green-300"}`}>
            {d.status === 1 ? "标记维护" : "恢复可用"}
          </button>
        </div>
      ))}

      {tab === "config" && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          {[
            { key: "max_duration", label: "单次最大时长", options: [["0", "不限制"], ["0.5", "30分钟"], ["1", "1小时"], ["1.5", "1.5小时"], ["2", "2小时"], ["3", "3小时"]] },
            { key: "max_daily", label: "单日最大预约次数", options: [["0", "不限制"], ["1", "1次"], ["2", "2次"], ["3", "3次"], ["4", "4次"]] },
            { key: "booking_window", label: "预约窗口", options: [["0", "不限制"], ["7", "未来7天"], ["14", "未来14天"], ["30", "未来30天"]] },
            { key: "slot_minutes", label: "时段粒度", options: [["15", "15分钟"], ["30", "30分钟"], ["60", "60分钟"]] },
            { key: "start_hour", label: "开始营业时间", options: [["5", "05:00"], ["6", "06:00"], ["7", "07:00"], ["8", "08:00"], ["9", "09:00"]] },
            { key: "end_hour", label: "最晚结束时间", options: [["22", "22:00"], ["23", "23:00"], ["24", "24:00"]] },
          ].map(({ key, label, options }) => (
            <div key={key} className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">{label}</label>
              <select value={(config as any)[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm bg-white">
                {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </div>
          ))}
          <button onClick={saveConfig} className="w-full bg-[#c86b3c] text-white rounded-xl py-2.5 text-sm mt-2">保存配置</button>
        </div>
      )}

      {banModal.show && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setBanModal({ ...banModal, show: false })}>
          <div className="bg-white rounded-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">封禁用户：@{banModal.name}</h3>
            <div className="flex gap-3 mb-4">
              <button onClick={() => setBanModal({ ...banModal, type: 1 })} className={`flex-1 py-2 rounded-lg text-sm border ${banModal.type === 1 ? "bg-red-50 text-red-500 border-red-300" : "border-gray-200 text-gray-500"}`}>临时</button>
              <button onClick={() => setBanModal({ ...banModal, type: 2 })} className={`flex-1 py-2 rounded-lg text-sm border ${banModal.type === 2 ? "bg-red-50 text-red-500 border-red-300" : "border-gray-200 text-gray-500"}`}>永久</button>
            </div>
            {banModal.type === 1 && (
              <input type="number" value={banModal.days} onChange={e => setBanModal({ ...banModal, days: Number(e.target.value) || 1 })} className="w-full border rounded-xl px-3 py-2 text-sm mb-4" placeholder="封禁天数" />
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
