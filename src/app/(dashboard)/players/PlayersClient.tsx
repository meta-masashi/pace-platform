"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, UserPlus, Copy, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  getACWRColor,
  getNRSColor,
  getHRVColor,
  getHPBarColor,
  formatDateTime,
} from "@/lib/utils";
import type { Athlete, Priority } from "@/types";

const statusLabel: Record<Priority, string> = {
  critical: "Critical",
  watchlist: "Watchlist",
  normal: "Normal",
};

interface InviteResult {
  code: string;
  expires_at: string;
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [athleteName, setAthleteName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_name: athleteName.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "招待コードの発行に失敗しました");
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiresDate = result
    ? new Date(result.expires_at).toLocaleDateString("ja-JP", { month: "long", day: "numeric" })
    : "";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">招待コード発行</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-gray-600">
                選手がモバイルアプリで新規登録する際に使用する招待コードを発行します。
                コードは<strong>1回使い切り・7日間有効</strong>です。
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  選手名（任意）
                </label>
                <input
                  type="text"
                  value={athleteName}
                  onChange={(e) => setAthleteName(e.target.value)}
                  placeholder="例: 山田 太郎"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">入力すると登録時に自動入力されます</p>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? "発行中..." : "招待コードを発行する"}
              </button>
            </>
          ) : (
            <>
              <div className="text-center space-y-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-medium text-gray-700">招待コードを発行しました</p>
              </div>

              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold tracking-[0.3em] text-gray-900 font-mono">
                  {result.code}
                </p>
                <p className="text-xs text-gray-400 mt-2">{expiresDate}まで有効</p>
              </div>

              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? "コピーしました" : "コードをコピー"}
              </button>

              <p className="text-xs text-gray-500 text-center">
                このコードをLINEやメールで選手に送ってください。
                <br />選手は athlete.hachi-riskon.com から新規登録できます。
              </p>

              <button
                onClick={() => { setResult(null); setAthleteName(""); }}
                className="w-full text-sm text-green-600 hover:text-green-700 font-medium py-1"
              >
                もう1枚発行する
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface PlayersClientProps {
  athletes: Athlete[];
}

export function PlayersClient({ athletes }: PlayersClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Priority | "all">("all");
  const [showInviteModal, setShowInviteModal] = useState(false);

  const filtered = athletes.filter((a) => {
    const matchSearch =
      a.name.includes(search) ||
      a.position.includes(search) ||
      String(a.number).includes(search);
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {showInviteModal && <InviteModal onClose={() => setShowInviteModal(false)} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">選手一覧</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{athletes.length}名登録</span>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            招待コード発行
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="選手名・ポジション・番号で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Priority | "all")}
          className="text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">全ステータス</option>
          <option value="critical">Critical</option>
          <option value="watchlist">Watchlist</option>
          <option value="normal">Normal</option>
        </select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">選手名</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ポジション</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">背番号</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[120px]">HP</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">NRS</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">HRV</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">ACWR</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">最終更新</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">アクション</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((athlete) => (
                <tr
                  key={athlete.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{athlete.name}</td>
                  <td className="px-4 py-3 text-gray-600">{athlete.position}</td>
                  <td className="px-4 py-3 text-center text-gray-600">#{athlete.number}</td>
                  <td className="px-4 py-3">
                    <Badge variant={athlete.status}>{statusLabel[athlete.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getHPBarColor(athlete.hp)}`}
                          style={{ width: `${athlete.hp}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-8 text-right">{athlete.hp}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-center font-semibold ${getNRSColor(athlete.nrs)}`}>
                    {athlete.nrs}
                  </td>
                  <td className={`px-4 py-3 text-center font-semibold ${getHRVColor(athlete.hrv)}`}>
                    {athlete.hrv}
                  </td>
                  <td className={`px-4 py-3 text-center font-semibold ${getACWRColor(athlete.acwr)}`}>
                    {athlete.acwr.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {formatDateTime(athlete.last_updated)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/players/${athlete.id}`}
                      className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">
                    該当する選手が見つかりません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
