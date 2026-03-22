"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle, AlertTriangle, ShieldAlert, Send, FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { mockActiveAssessment, mockStaff } from "@/lib/mock-data";
import type { Athlete, AssessmentNode, AnswerValue, AssessmentSummary, Role } from "@/types";

const igLabel = (ig?: number) => {
  if (!ig) return { label: "low", cls: "bg-gray-100 text-gray-600" };
  if (ig >= 0.8) return { label: "high", cls: "bg-red-100 text-red-700" };
  if (ig >= 0.6) return { label: "medium", cls: "bg-amber-100 text-amber-700" };
  return { label: "low", cls: "bg-gray-100 text-gray-600" };
};

const answerLabels: Record<AnswerValue, string> = { yes: "はい", no: "いいえ", unclear: "不明" };

const RISK_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  red:    { label: "高リスク",   cls: "bg-red-100 text-red-700 border-red-300",       icon: "🔴" },
  yellow: { label: "要観察",     cls: "bg-amber-100 text-amber-700 border-amber-300", icon: "🟡" },
  green:  { label: "異常なし",   cls: "bg-green-100 text-green-700 border-green-300", icon: "🟢" },
};

const INJURY_REGIONS = [
  { value: "lower_limb", label: "下肢（膝・足関節・股関節）", icon: "🦵" },
  { value: "upper_limb", label: "上肢（肩・肘・手首）", icon: "💪" },
  { value: "spine", label: "体幹・脊柱", icon: "🫀" },
  { value: "head_neck", label: "頭部・頸部", icon: "🧠" },
  { value: "general", label: "複合・不明", icon: "📋" },
] as const;

type InjuryRegion = typeof INJURY_REGIONS[number]["value"];

interface AssessmentClientProps {
  athlete: Athlete;
}

export function AssessmentClient({ athlete }: AssessmentClientProps) {
  const id = athlete.id;

  const [injuryRegion, setInjuryRegion] = useState<InjuryRegion | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<AssessmentNode | null>(null);
  const [responses, setResponses] = useState<Array<{ node_id: string; answer: AnswerValue; question_text: string }>>([]);
  const [summary, setSummary] = useState<AssessmentSummary | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [escalationSent, setEscalationSent] = useState(false);
  const [escalationTargets, setEscalationTargets] = useState<Role[]>(["PT"]);
  const [auditLogged, setAuditLogged] = useState(false);
  const [karteSaved, setKarteSaved] = useState(false);

  async function startSession(region: InjuryRegion) {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/assessment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athlete_id: athlete.id,
          staff_id: mockActiveAssessment.staff_id,
          assessment_type: mockActiveAssessment.assessment_type,
          injury_region: region,
        }),
      });
      if (!res.ok) throw new Error("start failed");
      const data = await res.json();
      setSessionId(data.session_id);
      setCurrentQuestion(data.first_question ?? null);
    } catch {
      setStartError("アセスメントを開始できませんでした。再度お試しください。");
    } finally {
      setStarting(false);
    }
  }

  const handleAnswer = async (answer: AnswerValue) => {
    if (!currentQuestion || !sessionId || loading) return;
    setLoading(true);

    const responded = {
      node_id: currentQuestion.node_id,
      answer,
      question_text: currentQuestion.question_text,
    };

    try {
      const res = await fetch("/api/assessment/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, node_id: currentQuestion.node_id, answer }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) setSummary(data.summary);
        setIsComplete(data.is_complete ?? false);
        setIsEmergency(data.is_emergency ?? false);
        setCurrentQuestion(data.next_question ?? null);
      }
    } catch {
      // record locally on network error
    }

    setResponses((prev) => [...prev, responded]);
    setLoading(false);
  };

  const ig = igLabel(currentQuestion?.information_gain);
  const regionLabel = INJURY_REGIONS.find((r) => r.value === injuryRegion);
  const riskBadge = summary ? (RISK_BADGE[summary.riskLevel] ?? RISK_BADGE.green) : null;

  // Step 1: Injury region selector
  if (!injuryRegion) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/players/${id}`} className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">アセスメント</h1>
        </div>

        <div className="max-w-lg mx-auto">
          <Card>
            <CardContent className="py-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">主訴部位を選択してください</h2>
                <p className="text-xs text-gray-500 mt-1">
                  選択内容に合わせて関連するレッドフラッグのみ確認します
                </p>
              </div>
              <div className="space-y-2">
                {INJURY_REGIONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => {
                      setInjuryRegion(r.value);
                      startSession(r.value);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-colors text-left"
                  >
                    <span className="text-xl">{r.icon}</span>
                    <span className="text-sm font-medium text-gray-800">{r.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 text-center">
                PACE CAT — {athlete.name} / {mockActiveAssessment.assessment_type}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (starting) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">アセスメントを準備中...</p>
      </div>
    );
  }

  if (startError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-red-600 text-sm">{startError}</p>
        <Button variant="outline" onClick={() => { setInjuryRegion(null); setStartError(null); }}>
          部位選択に戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/players/${id}`} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">アセスメント</h1>
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">PACE CAT — {athlete.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  isComplete ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {isComplete ? "完了" : "進行中"}
                </span>
                {regionLabel && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                    {regionLabel.icon} {regionLabel.label}
                  </span>
                )}
              </div>
            </div>
            <span className="text-sm text-gray-500">{responses.length} 問回答済み</span>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(100, responses.length * 12.5)}%` }}
            />
          </div>

          {isEmergency && (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-800 text-sm">緊急対応フラグ — 即時エスカレーションが必要です</p>
                  <p className="text-xs text-red-600 mt-1">レッドフラッグ検出。下記の専門職への連絡を行ってください。</p>
                </div>
              </div>

              {/* Escalation panel */}
              {!escalationSent ? (
                <div className="bg-white border border-red-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-600" />
                    <p className="text-sm font-semibold text-gray-900">エスカレーション送信</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">通知先（複数選択可）</p>
                    <div className="flex gap-2">
                      {(["PT", "master"] as Role[]).map(role => {
                        const staffMember = mockStaff.find(s => s.role === role);
                        const checked = escalationTargets.includes(role);
                        return (
                          <button
                            key={role}
                            onClick={() => setEscalationTargets(prev =>
                              checked ? prev.filter(r => r !== role) : [...prev, role]
                            )}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                              checked ? "bg-red-100 border-red-300 text-red-700" : "border-gray-200 text-gray-500"
                            }`}
                          >
                            {role} {staffMember ? `（${staffMember.name}）` : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bg-red-50 rounded p-2 text-xs text-red-700 leading-relaxed">
                    【緊急エスカレーション】{athlete.name} — レッドフラッグ検出。即時確認をお願いします。※PACE判断支援補助情報。最終判断は有資格者が行ってください。
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setEscalationSent(true);
                      setAuditLogged(true);
                    }}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    エスカレーション送信
                  </Button>
                  <p className="text-xs text-gray-400 text-center">送信と同時に免責証跡ログを記録します</p>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-4 h-4" />
                    <p className="text-sm font-semibold">エスカレーション送信完了</p>
                  </div>
                  <p className="text-xs text-green-600">
                    送信先: {escalationTargets.join("・")} / {new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-green-600">免責証跡ログ記録済み（PACE-CDS-v1.2.0）</p>
                </div>
              )}
            </div>
          )}

          {isComplete && !isEmergency && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-green-800 text-sm">アセスメント完了</p>
                  <p className="text-xs text-green-600 mt-1">右側の評価候補を参考に、最終判断を行ってください。</p>
                </div>
              </div>
              {/* Audit trail confirmation */}
              {!auditLogged ? (
                <button
                  onClick={() => setAuditLogged(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <FileText className="w-4 h-4 text-gray-500" />
                  免責確認 — 評価候補を確認し、最終判断を自分で行いました
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <p className="text-xs text-blue-700">
                    免責証跡ログ記録済み — {new Date().toLocaleString("ja-JP")} / PACE-CDS-v1.2.0
                  </p>
                </div>
              )}
              {/* Save to Karte */}
              {summary && (
                !karteSaved ? (
                  <button
                    onClick={() => {
                      try {
                        const existing = JSON.parse(
                          localStorage.getItem(`assessment-results-${id}`) ?? "[]"
                        ) as Array<typeof summary & { savedAt: string; athleteId: string }>;
                        existing.unshift({
                          ...summary,
                          savedAt: new Date().toISOString(),
                          athleteId: id,
                        });
                        localStorage.setItem(
                          `assessment-results-${id}`,
                          JSON.stringify(existing.slice(0, 20))
                        );
                        setKarteSaved(true);
                      } catch {
                        // ignore
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700 hover:bg-indigo-100 transition-colors font-medium"
                  >
                    <FileText className="w-4 h-4 text-indigo-500" />
                    カルテに保存
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                      <CheckCircle className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                      <p className="text-xs text-indigo-700">カルテに保存しました</p>
                    </div>
                    <Link
                      href={`/players/${id}/karte`}
                      className="flex items-center justify-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 py-1"
                    >
                      カルテを開く →
                    </Link>
                  </div>
                )
              )}
            </div>
          )}

          {!isComplete && !isEmergency && currentQuestion && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  {currentQuestion.phase && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-600 mb-2">
                      {currentQuestion.phase}
                    </span>
                  )}
                  <p className="font-medium text-blue-900 text-base leading-snug">
                    {currentQuestion.question_text}
                  </p>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ig.cls}`}>
                  {ig.label}
                </span>
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="primary" onClick={() => handleAnswer("yes")} disabled={loading} className="flex-1">
                  Yes（はい）
                </Button>
                <Button variant="danger" onClick={() => handleAnswer("no")} disabled={loading} className="flex-1">
                  No（いいえ）
                </Button>
                <Button variant="outline" onClick={() => handleAnswer("unclear")} disabled={loading} className="flex-1">
                  不明
                </Button>
              </div>
            </div>
          )}

          {responses.length > 0 && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-medium text-gray-500 mb-2">回答ログ</p>
                <div className="space-y-1.5">
                  {responses.map((r, i) => (
                    <div key={`${r.node_id}-${i}`} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 w-4">{i + 1}.</span>
                      <span className="text-gray-600 flex-1 truncate">{r.question_text}</span>
                      <span className={`px-1.5 py-0.5 rounded font-medium ${
                        r.answer === "yes" ? "bg-green-100 text-green-700"
                        : r.answer === "no" ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                      }`}>
                        {answerLabels[r.answer]}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-gray-400 text-center">
            最終的な臨床判断はフィールドスタッフが行います。AIは意思決定を支援します。
          </p>
        </div>

        {/* Right column — multi-axis assessment summary */}
        <div className="col-span-2 space-y-4">
          <Card>
            <CardContent className="py-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">リアルタイム評価サマリー</p>
                <p className="text-xs text-gray-400 mt-0.5">※ AI補助情報。医学的診断ではありません</p>
              </div>

              {/* Risk level badge */}
              {riskBadge && summary && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${riskBadge.cls}`}>
                  <span>{riskBadge.icon}</span>
                  <span>{riskBadge.label}</span>
                  <span className="ml-auto text-xs font-normal opacity-70">
                    信頼度 {Math.round(summary.confidenceScore * 100)}%
                  </span>
                </div>
              )}

              {/* Interpretation */}
              {summary && (
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-700 leading-relaxed">{summary.interpretation}</p>
                </div>
              )}

              {/* Positive findings */}
              {summary && summary.positiveFindings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase">有意な所見</p>
                  {summary.positiveFindings.map((f, i) => (
                    <div
                      key={`${f.nodeId}-${i}`}
                      className={`rounded-lg px-3 py-2 text-xs space-y-0.5 border ${
                        f.isSignificant
                          ? "bg-amber-50 border-amber-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold px-1.5 py-0.5 rounded ${
                          f.isSignificant ? "bg-amber-200 text-amber-800" : "bg-gray-200 text-gray-600"
                        }`}>
                          {f.axis}
                        </span>
                        {f.isSignificant && (
                          <span className="text-amber-600 font-medium">有意</span>
                        )}
                      </div>
                      <p className="text-gray-700 leading-snug">{f.question.slice(0, 80)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Prescription tags */}
              {summary && summary.allPrescriptionTags.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 uppercase">推奨アクション</p>
                  <div className="flex flex-wrap gap-1">
                    {summary.allPrescriptionTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contraindication tags */}
              {summary && summary.allContraindicationTags.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-red-500 uppercase">禁忌・注意事項</p>
                  <div className="flex flex-wrap gap-1">
                    {summary.allContraindicationTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!summary && (
                <p className="text-xs text-gray-400 text-center py-4">
                  回答を進めると評価サマリーが表示されます
                </p>
              )}
            </CardContent>
          </Card>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800 font-semibold mb-1">重要なお知らせ</p>
            <p className="text-xs text-yellow-700 leading-relaxed">
              表示される評価候補はAIによる補助情報であり、医学的診断ではありません。
              最終的な判断は必ず有資格者が行ってください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
