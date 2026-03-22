"use client";

import { useState } from "react";
import { Shield, Lock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { Staff } from "@/types";

const roleLabels: Record<string, string> = {
  master: "マスター",
  AT: "アスレティックトレーナー",
  PT: "理学療法士",
  "S&C": "S&Cコーチ",
};

interface SettingsClientProps {
  staff: Staff[];
}

export function SettingsClient({ staff }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<"account" | "permissions" | "plan" | "security">("account");

  const tabs = [
    { key: "account", label: "アカウント" },
    { key: "permissions", label: "権限管理" },
    { key: "plan", label: "契約・プラン" },
    { key: "security", label: "セキュリティ" },
  ] as const;

  const currentStaff = staff[0];

  if (!currentStaff) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="text-sm text-gray-500">スタッフが登録されていません</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">設定</h1>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "account" && (
        <Card>
          <CardHeader>
            <CardTitle>プロフィール設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">氏名</label>
                <input
                  type="text"
                  defaultValue={currentStaff.name}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  defaultValue={currentStaff.email}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">役割</label>
                <div className="px-3 py-2 text-sm border border-gray-100 rounded-md bg-gray-50 text-gray-600">
                  {roleLabels[currentStaff.role] ?? currentStaff.role}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属チーム</label>
                <input
                  type="text"
                  defaultValue="FCペース 第一チーム"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="primary">保存</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "permissions" && (
        <Card>
          <CardHeader>
            <CardTitle>スタッフ権限管理</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">氏名</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">メール</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">役割</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">リーダー</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {staff.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="default">{s.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${
                          s.is_leader
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {s.is_leader ? "✓" : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm">編集</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === "plan" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-gray-900">Pro プラン</span>
                    <Badge variant="normal">有効</Badge>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">FCペース 第一チーム</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">18<span className="text-sm font-normal text-gray-500"> / 25名</span></p>
                  <p className="text-xs text-gray-400">登録選手数</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">含まれる機能</p>
                <ul className="space-y-1.5">
                  {[
                    "PACE CAT アセスメント（無制限）",
                    "AIメニュー自動生成",
                    "リアルタイムトリアージ",
                    "チームコミュニティ機能",
                    "SOAP AIアシスト",
                    "データエクスポート（CSV/PDF）",
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="outline">プランを変更</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "security" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>セキュリティ設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">二要素認証（2FA）</p>
                    <p className="text-xs text-gray-500">認証アプリによる確認</p>
                  </div>
                </div>
                <Badge variant="normal">有効</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">データ暗号化</p>
                    <p className="text-xs text-gray-500">AES-256 / TLS 1.3 による転送・保存時暗号化</p>
                  </div>
                </div>
                <Badge variant="normal">有効</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-purple-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">監査ログ</p>
                    <p className="text-xs text-gray-500">全操作ログを90日間保持。エクスポート可能</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">ログを表示</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
