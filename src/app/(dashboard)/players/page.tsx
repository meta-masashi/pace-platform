"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { mockAthletes } from "@/lib/mock-data";
import {
  getACWRColor,
  getNRSColor,
  getHRVColor,
  getHPBarColor,
  formatDateTime,
} from "@/lib/utils";
import type { Priority } from "@/types";

const statusLabel: Record<Priority, string> = {
  critical: "Critical",
  watchlist: "Watchlist",
  normal: "Normal",
};

export default function PlayersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Priority | "all">("all");

  const filtered = mockAthletes.filter((a) => {
    const matchSearch =
      a.name.includes(search) || a.position.includes(search) || String(a.number).includes(search);
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">選手一覧</h1>
        <span className="text-sm text-gray-500">{mockAthletes.length}名登録</span>
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
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
