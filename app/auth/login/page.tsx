'use client';

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) router.replace("/");
    });
  }, []);

  const handleLogin = async () => {
    if (!email) return;
    setSending(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
    setSending(false);
  };

  if (sent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-amber-50">
        <div className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-sm text-center">
          <div className="text-5xl mb-4">✉️</div>
          <h1 className="text-xl font-bold mb-2">验证邮件已发送</h1>
          <p className="text-gray-500 text-sm">请检查 {email} 的收件箱，点击登录链接即可进入</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-amber-50">
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🍳</div>
          <h1 className="text-2xl font-bold">创意厨房预约</h1>
          <p className="text-gray-500 text-sm mt-2">数字游民社区公共厨房</p>
        </div>
        <input
          type="email"
          placeholder="输入邮箱地址"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 mb-4 text-sm focus:outline-none focus:border-orange-400"
        />
        {error && <p className="text-red-500 text-xs mb-4">{error}</p>}
        <button
          onClick={handleLogin}
          disabled={sending || !email}
          className="w-full bg-orange-500 text-white rounded-xl py-3 font-medium disabled:opacity-40"
        >
          {sending ? "发送中..." : "发送登录链接"}
        </button>
        <p className="text-gray-400 text-xs text-center mt-4">
          无需密码，点击邮件中的链接即可登录
        </p>
      </div>
    </div>
  );
}
