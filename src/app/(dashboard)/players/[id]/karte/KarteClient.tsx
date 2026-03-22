"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Sparkles, Save, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Athlete, SoapNote, RehabProgram, AssessmentSummary, Priority, RiskLevel } from "@/types";

// ---- helpers ----

const statusLabel: Record<Priority, string> = {
  critical: "Critical",
  watchlist: "Watchlist",
  normal: "Normal",
};

const riskBadgeClass: Record<RiskLevel, string> = {
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
};

const riskIcon: Record<RiskLevel, string> = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
};

const riskLabel: Record<RiskLevel, string> = {
  green: "異常なし",
  yellow: "要観察",
  red: "高リスク",
};

// LocalStorage SOAP note shape
interface LocalSoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  createdAt: string;
  staffId: string;
}

// Extended AssessmentSummary stored in localStorage
interface StoredAssessmentSummary extends AssessmentSummary {
  savedAt: string;
  athleteId: string;
  assessmentType?: string;
}

interface KarteClientProps {
  athlete: Athlete;
  soapNotes: SoapNote[];
  rehabProgram: RehabProgram | null;
}

type Tab = "summary" | "soap" | "assessment" | "rehab";

export function KarteClient({ athlete, soapNotes, rehabProgram }: KarteClientProps) {
  const athleteId = athlete.id;

  const [activeTab, setActiveTab] = useState<Tab>("summary");

  // SOAP form state
  const [soap, setSoap] = useState({
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [localSoapNotes, setLocalSoapNotes] = useState<LocalSoapNote[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Assessment history from localStorage
  const [assessmentHistory, setAssessmentHistory] = useState<StoredAssessmentSummary[]>([]);

  useEffect(() => {
    // Load local SOAP notes
    try {
      const saved = JSON.parse(
        localStorage.getItem(`karte-soap-${athleteId}`) ?? "[]"
      ) as LocalSoapNote[];
      setLocalSoapNotes(saved);
    } catch {
      setLocalSoapNotes([]);
    }

    // Load assessment history
    try {
      const saved = JSON.parse(
        localStorage.getItem(`assessment-results-${athleteId}`) ?? "[]"
      ) as StoredAssessmentSummary[];
      setAssessmentHistory(saved);
    } catch {
      setAssessmentHistory([]);
    }
  }, [athleteId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleAiAssist = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/soap-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athlete_id: athleteId,
          assessment_result: {
            primary_diagnosis: undefined,
            differentials: [],
            prescription_tags: [],
            contraindication_tags: [],
            is_emergency: false,
          },
          existing_notes: [soap.subjective, soap.objective, soap.assessment, soap.plan]
            .filter(Boolean)
            .join("\n"),
        }),
      });
      const data = await res.json() as {
        s_draft?: string;
        o_draft?: string;
        a_draft?: string;
        p_draft?: string;
        error?: string;
      };
      if (data.s_draft || data.o_draft || data.a_draft || data.p_draft) {
        setSoap({
          subjective: data.s_draft ?? soap.subjective,
          objective: data.o_draft ?? soap.objective,
          assessment: data.a_draft ?? soap.assessment,
          plan: data.p_draft ?? soap.plan,
        });
        showToast("AI下書きを生成しました（必ず確認・編集してください）");
      } else {
        showToast("AI生成に失敗しました");
      }
    } catch {
      showToast("AI生成に失敗しました");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveSoap = () => {
    try {
      const existing = JSON.parse(
        localStorage.getItem(`karte-soap-${athleteId}`) ?? "[]"
      ) as LocalSoapNote[];
      const newNote: LocalSoapNote = {
        ...soap,
        createdAt: new Date().toISOString(),
        staffId: "local",
      };
      existing.unshift(newNote);
      localStorage.setItem(
        `karte-soap-${athleteId}`,
        JSON.stringify(existing.slice(0, 20))
      );
      setLocalSoapNotes([newNote, ...existing.slice(1)]);
      setSoap({ subjective: "", objective: "", assessment: "", plan: "" });
      showToast("保存しました（β版: ローカルのみ）");
    } catch {
      showToast("保存に失敗しました");
    }
  };

  const initials = athlete.name
    .split(" ")
    .map((s) => s.charAt(0))
    .join("")
    .slice(0, 2);

  const latestLocalSoap = localSoapNotes[0] ?? null;
  const latestAssessment = assessmentHistory[0] ?? null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "summary", label: "サマリー" },
    { key: "soap", label: "SOAP記録" },
    { key: "assessment", label: "アセスメント履歴" },
    { key: "rehab", label: "リハビリ" },
  ];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/players/${athleteId}`}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-indigo-700 font-bold text-sm">{initials}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{athlete.name}</h1>
              <Badge variant={athlete.status}>{statusLabel[athlete.status]}</Badge>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                カルテ
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {athlete.position} / #{athlete.number} / {athlete.age}歳
            </p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: サマリー */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {/* Condition KPIs */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium text-gray-500 mb-1">HP</p>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-bold text-gray-900">{athlete.hp}</span>
                  <span className="text-xs text-gray-400 mb-1">/100</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                  <div
                    className={`h-1.5 rounded-full ${
                      athlete.hp < 50
                        ? "bg-red-500"
                        : athlete.hp < 75
                        ? "bg-amber-500"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${athlete.hp}%` }}
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium text-gray-500 mb-1">NRS</p>
                <div className="flex items-end gap-1">
                  <span
                    className={`text-2xl font-bold ${
                      athlete.nrs >= 7
                        ? "text-red-600"
                        : athlete.nrs >= 4
                        ? "text-amber-600"
                        : "text-green-600"
                    }`}
                  >
                    {athlete.nrs}
                  </span>
                  <span className="text-xs text-gray-400 mb-1">/10</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">疼痛スコア</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium text-gray-500 mb-1">ACWR</p>
                <span
                  className={`text-2xl font-bold ${
                    athlete.acwr > 1.5
                      ? "text-red-600"
                      : athlete.acwr > 1.3
                      ? "text-amber-600"
                      : "text-green-600"
                  }`}
                >
                  {athlete.acwr.toFixed(2)}
                </span>
                <p className="text-xs text-gray-400 mt-1">急性:慢性比率</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium text-gray-500 mb-1">HRV</p>
                <span className="text-2xl font-bold text-gray-900">
                  {athlete.hrv.toFixed(1)}
                </span>
                <span className="text-xs text-gray-400 ml-1">ms</span>
                <p className="text-xs text-gray-400 mt-1">心拍変動</p>
              </CardContent>
            </Card>
          </div>

          {/* Active Rehab Program */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">アクティブリハビリプログラム</CardTitle>
            </CardHeader>
            <CardContent>
              {rehabProgram ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {rehabProgram.diagnosis_label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Phase {rehabProgram.current_phase} / 開始:{" "}
                      {rehabProgram.start_date} / RTP目標:{" "}
                      {rehabProgram.estimated_rtp_date}
                    </p>
                  </div>
                  <Link href={`/rehabilitation/${rehabProgram.id}`}>
                    <Button variant="outline">
                      詳細
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  アクティブなリハビリプログラムはありません
                </p>
              )}
            </CardContent>
          </Card>

          {/* Latest SOAP */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">最新SOAP記録</CardTitle>
                <button
                  onClick={() => setActiveTab("soap")}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  すべて見る →
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {latestLocalSoap ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    {new Date(latestLocalSoap.createdAt).toLocaleString("ja-JP")}（ローカル保存）
                  </p>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    {latestLocalSoap.subjective && (
                      <p className="text-xs text-gray-700">
                        <span className="font-semibold text-gray-900">S: </span>
                        {latestLocalSoap.subjective.slice(0, 100)}
                        {latestLocalSoap.subjective.length > 100 ? "…" : ""}
                      </p>
                    )}
                    {latestLocalSoap.plan && (
                      <p className="text-xs text-gray-700">
                        <span className="font-semibold text-gray-900">P: </span>
                        {latestLocalSoap.plan.slice(0, 100)}
                        {latestLocalSoap.plan.length > 100 ? "…" : ""}
                      </p>
                    )}
                  </div>
                </div>
              ) : soapNotes.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    {new Date(soapNotes[0].created_at).toLocaleString("ja-JP")}
                  </p>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    {soapNotes[0].s_text && (
                      <p className="text-xs text-gray-700">
                        <span className="font-semibold text-gray-900">S: </span>
                        {soapNotes[0].s_text.slice(0, 100)}
                        {soapNotes[0].s_text.length > 100 ? "…" : ""}
                      </p>
                    )}
                    {soapNotes[0].p_text && (
                      <p className="text-xs text-gray-700">
                        <span className="font-semibold text-gray-900">P: </span>
                        {soapNotes[0].p_text.slice(0, 100)}
                        {soapNotes[0].p_text.length > 100 ? "…" : ""}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">SOAP記録がありません</p>
              )}
            </CardContent>
          </Card>

          {/* Latest Assessment */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">最新アセスメント結果</CardTitle>
                <button
                  onClick={() => setActiveTab("assessment")}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  すべて見る →
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {latestAssessment ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        riskBadgeClass[latestAssessment.riskLevel]
                      }`}
                    >
                      {riskIcon[latestAssessment.riskLevel]}
                      {riskLabel[latestAssessment.riskLevel]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(latestAssessment.savedAt).toLocaleDateString("ja-JP")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 bg-gray-50 rounded p-2 leading-relaxed">
                    {latestAssessment.interpretation.slice(0, 150)}
                    {latestAssessment.interpretation.length > 150 ? "…" : ""}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">アセスメント結果がありません</p>
                  <Link href={`/assessment/${athleteId}`}>
                    <Button variant="outline">アセスメント開始</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: SOAP記録 */}
      {activeTab === "soap" && (
        <div className="space-y-6">
          {/* New SOAP form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">新規SOAPノート</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "subjective" as const, label: "S（主観的情報）", placeholder: "選手の主訴・自覚症状を入力..." },
                { key: "objective" as const, label: "O（客観的情報）", placeholder: "客観的所見・測定値・テスト結果を入力..." },
                { key: "assessment" as const, label: "A（評価）", placeholder: "評価・判断・診断根拠を入力..." },
                { key: "plan" as const, label: "P（計画）", placeholder: "今後の治療計画・禁忌事項・次回評価予定を入力..." },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                  </label>
                  <textarea
                    value={soap[key]}
                    onChange={(e) => setSoap((prev) => ({ ...prev, [key]: e.target.value }))}
                    rows={3}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              ))}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                <p className="text-xs text-yellow-800">
                  AI下書きはあくまで補助情報です。最終記録は必ず担当スタッフが確認・編集してください。
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={handleAiAssist}
                  disabled={aiLoading}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {aiLoading ? "生成中..." : "AI下書き生成"}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveSoap}
                  className="flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  保存
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* SOAP history */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">記録一覧</h2>

            {/* Local SOAP notes */}
            {localSoapNotes.map((note, i) => (
              <Card key={`local-${i}`}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {new Date(note.createdAt).toLocaleString("ja-JP")}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      ローカル保存
                    </span>
                  </div>
                  {note.subjective && (
                    <p className="text-xs text-gray-700">
                      <span className="font-semibold">S: </span>
                      {note.subjective.slice(0, 120)}
                      {note.subjective.length > 120 ? "…" : ""}
                    </p>
                  )}
                  {note.plan && (
                    <p className="text-xs text-gray-700">
                      <span className="font-semibold">P: </span>
                      {note.plan.slice(0, 120)}
                      {note.plan.length > 120 ? "…" : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* DB SOAP notes */}
            {soapNotes.map((note) => (
              <Card key={note.id}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {new Date(note.created_at).toLocaleString("ja-JP")}
                    </span>
                    <span className="text-xs text-gray-400">
                      担当: {note.staff_id}
                    </span>
                    {note.ai_assisted && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                        AI補助
                      </span>
                    )}
                  </div>
                  {note.s_text && (
                    <p className="text-xs text-gray-700">
                      <span className="font-semibold">S: </span>
                      {note.s_text.slice(0, 120)}
                      {note.s_text.length > 120 ? "…" : ""}
                    </p>
                  )}
                  {note.p_text && (
                    <p className="text-xs text-gray-700">
                      <span className="font-semibold">P: </span>
                      {note.p_text.slice(0, 120)}
                      {note.p_text.length > 120 ? "…" : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}

            {localSoapNotes.length === 0 && soapNotes.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-gray-400">
                  SOAPノートがありません。上のフォームから記録してください。
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Tab: アセスメント履歴 */}
      {activeTab === "assessment" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">アセスメント履歴</h2>
            <Link href={`/assessment/${athleteId}`}>
              <Button variant="primary" className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                アセスメント開始
              </Button>
            </Link>
          </div>

          {assessmentHistory.length > 0 ? (
            <div className="space-y-3">
              {assessmentHistory.map((item, i) => (
                <Card key={`assessment-${i}`}>
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            item.riskLevel === "red"
                              ? "bg-red-100 text-red-800 border-red-300"
                              : item.riskLevel === "yellow"
                              ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                              : "bg-green-100 text-green-800 border-green-300"
                          }`}
                        >
                          {riskIcon[item.riskLevel]}
                          {riskLabel[item.riskLevel]}
                        </span>
                        {item.assessmentType && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            {item.assessmentType}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {new Date(item.savedAt).toLocaleDateString("ja-JP")}
                        </p>
                        <p className="text-xs text-gray-400">
                          {item.nodesAnswered}問 / 信頼度 {Math.round(item.confidenceScore * 100)}%
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-700 leading-relaxed">
                        {item.interpretation}
                      </p>
                    </div>

                    {item.positiveFindings.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          有意な所見 ({item.positiveFindings.length}件)
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {item.positiveFindings.slice(0, 4).map((f, fi) => (
                            <span
                              key={`f-${fi}`}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                            >
                              {f.axis}
                            </span>
                          ))}
                          {item.positiveFindings.length > 4 && (
                            <span className="text-xs text-gray-400">
                              +{item.positiveFindings.length - 4}件
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <p className="text-sm text-gray-400">アセスメントを実施してください</p>
                <Link href={`/assessment/${athleteId}`}>
                  <Button variant="primary">アセスメントを開始する</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tab: リハビリ */}
      {activeTab === "rehab" && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">リハビリプログラム</h2>
          {rehabProgram ? (
            <Card>
              <CardContent className="py-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {rehabProgram.diagnosis_label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      コード: {rehabProgram.diagnosis_code}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                      rehabProgram.status === "active"
                        ? "bg-green-100 text-green-800"
                        : rehabProgram.status === "completed"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {rehabProgram.status === "active"
                      ? "進行中"
                      : rehabProgram.status === "completed"
                      ? "完了"
                      : "保留"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">現在のフェーズ</p>
                    <p className="text-lg font-bold text-gray-900">
                      Phase {rehabProgram.current_phase}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">開始日</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {rehabProgram.start_date}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">RTP目標日</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {rehabProgram.estimated_rtp_date || "—"}
                    </p>
                  </div>
                  {rehabProgram.lsi_percent != null && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">LSI</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {rehabProgram.lsi_percent}%
                      </p>
                    </div>
                  )}
                </div>

                {rehabProgram.rom != null && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">可動域 (ROM)</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {rehabProgram.rom}°
                    </p>
                  </div>
                )}

                <div className="flex justify-end">
                  <Link href={`/rehabilitation/${rehabProgram.id}`}>
                    <Button variant="primary" className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4" />
                      リハビリ詳細を開く
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-gray-400">
                  アクティブなリハビリプログラムはありません
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
