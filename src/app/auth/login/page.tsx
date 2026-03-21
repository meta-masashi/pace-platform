"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("メールアドレスまたはパスワードが正しくありません");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <div className="text-center mb-6">
            <div className="inline-flex w-12 h-12 rounded-xl bg-green-600 items-center justify-center mb-3">
              <span className="text-white text-xl font-bold">P</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">PACE</h1>
            <p className="text-sm text-gray-500 mt-1">スタッフログイン</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="master@paceplatform.com"
                required
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="block w-full text-center px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              {loading ? "ログイン中..." : "ログイン"}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-4">
            アカウントの作成・変更は管理者にお問い合わせください
          </p>
        </div>

        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-600">
          <p className="font-semibold mb-1">テストアカウント（共通パスワード: Pace2026!）</p>
          <p>master@paceplatform.com — Master（全権限）</p>
          <p>at@paceplatform.com — AT（アスレティックトレーナー）</p>
          <p>pt@paceplatform.com — PT（理学療法士）</p>
          <p>sc@paceplatform.com — S&C（S&Cコーチ）</p>
        </div>
      </div>
    </div>
  );
}
