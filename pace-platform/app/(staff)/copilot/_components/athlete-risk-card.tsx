'use client';

/**
 * PACE v6.0 — 選手リスクカード
 *
 * 個別の選手カード:
 * - 左: 判定色インジケーター（RED/ORANGE/YELLOW/GREEN）
 * - 中央: 選手名、優先度タグ、判定理由
 * - 右: 推奨アクション + 承認ボタン（P1/P2）
 * - 展開: トレース詳細
 */

import { useState } from 'react';
import { AcknowledgeForm } from './acknowledge-form';
import { TraceDetailModal } from './trace-detail-modal';
import { LegalDisclaimer } from './legal-disclaimer';

interface TraceData {
  trace_id: string;
  athlete_id: string;
  timestamp_utc: string;
  pipeline_version: string;
  decision: string;
  priority: string;
  athlete_name?: string;
  inference_snapshot: {
    inputs?: Record<string, unknown>;
    calculatedMetrics?: Record<string, unknown>;
    bayesianComputation?: Record<string, unknown>;
    overridesApplied?: string[];
    decisionReason?: string;
    nodeResults?: Record<
      string,
      { success: boolean; executionTimeMs: number; warnings: string[] }
    >;
  };
  acknowledged_by?: string;
  acknowledged_at?: string;
  acknowledge_action?: string;
  acknowledged_staff_name?: string;
}

interface AthleteRiskCardProps {
  athleteId: string;
  athleteName: string;
  trace: TraceData | null;
}

const DECISION_BG: Record<string, string> = {
  RED: 'bg-[#DC2626]',
  ORANGE: 'bg-[#EA580C]',
  YELLOW: 'bg-[#CA8A04]',
  GREEN: 'bg-[#16A34A]',
};

const DECISION_LABELS: Record<string, string> = {
  RED: '停止',
  ORANGE: '警戒',
  YELLOW: '注意',
  GREEN: '良好',
};

const PRIORITY_LABELS: Record<string, string> = {
  P1_SAFETY: 'P1: 安全性',
  P2_MECHANICAL_RISK: 'P2: 力学的リスク',
  P3_DECOUPLING: 'P3: デカップリング',
  P4_GAS_EXHAUSTION: 'P4: GAS疲憊期',
  P5_NORMAL: 'P5: 正常適応',
};

const PRIORITY_TAG_STYLE: Record<string, string> = {
  P1_SAFETY: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  P2_MECHANICAL_RISK: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  P3_DECOUPLING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  P4_GAS_EXHAUSTION: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  P5_NORMAL: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export function AthleteRiskCard({ athleteId, athleteName, trace }: AthleteRiskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [showAcknowledgeForm, setShowAcknowledgeForm] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(!!trace?.acknowledged_at);

  if (!trace) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
        <div className="h-full w-1.5 shrink-0 self-stretch rounded-full bg-muted" />
        <div className="flex-1">
          <p className="font-medium text-foreground">{athleteName}</p>
          <p className="text-sm text-muted-foreground">データなし</p>
        </div>
      </div>
    );
  }

  const decision = trace.decision;
  const priority = trace.priority;
  const requiresApproval =
    (priority === 'P1_SAFETY' || priority === 'P2_MECHANICAL_RISK') && !isAcknowledged;

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
        <div className="flex">
          {/* 左: カラーインジケーター */}
          <div className={`w-2 shrink-0 ${DECISION_BG[decision] ?? 'bg-muted'}`} />

          <div className="flex flex-1 flex-col gap-3 p-4 md:flex-row md:items-center">
            {/* 中央: 選手情報 */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-semibold text-foreground">
                  {athleteName}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    PRIORITY_TAG_STYLE[priority] ?? 'bg-muted text-muted-foreground'
                  }`}
                >
                  {PRIORITY_LABELS[priority] ?? priority}
                </span>
                {isAcknowledged && (
                  <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    承認済
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {DECISION_LABELS[decision] ?? decision}
              </p>
              {trace.inference_snapshot.decisionReason && (
                <p className="mt-1 line-clamp-2 text-sm text-foreground">
                  {trace.inference_snapshot.decisionReason}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(trace.timestamp_utc).toLocaleString('ja-JP', {
                  timeZone: 'Asia/Tokyo',
                })}
              </p>
            </div>

            {/* 右: アクションボタン */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {requiresApproval && (
                <button
                  onClick={() => setShowAcknowledgeForm(true)}
                  className="rounded-md bg-[#DC2626] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#DC2626]/90"
                >
                  承認が必要
                </button>
              )}
              <button
                onClick={() => setShowTraceModal(true)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                根拠データを見る
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={isExpanded ? '閉じる' : '展開'}
              >
                <svg
                  className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 展開エリア: トレース概要 */}
        {isExpanded && (
          <div className="border-t border-border bg-muted/30 p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {trace.inference_snapshot.calculatedMetrics && (
                <>
                  <QuickMetric
                    label="ACWR"
                    value={
                      (
                        trace.inference_snapshot.calculatedMetrics as Record<
                          string,
                          number
                        >
                      ).acwr
                    }
                  />
                  <QuickMetric
                    label="単調性"
                    value={
                      (
                        trace.inference_snapshot.calculatedMetrics as Record<
                          string,
                          number
                        >
                      ).monotonyIndex
                    }
                  />
                  <QuickMetric
                    label="プレパレッドネス"
                    value={
                      (
                        trace.inference_snapshot.calculatedMetrics as Record<
                          string,
                          number
                        >
                      ).preparedness
                    }
                  />
                </>
              )}
              {trace.inference_snapshot.overridesApplied &&
                trace.inference_snapshot.overridesApplied.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">オーバーライド</p>
                    <p className="text-sm font-medium text-foreground">
                      {trace.inference_snapshot.overridesApplied.join(', ')}
                    </p>
                  </div>
                )}
            </div>
            <div className="mt-3">
              <LegalDisclaimer />
            </div>
          </div>
        )}
      </div>

      {/* トレース詳細モーダル */}
      {showTraceModal && (
        <TraceDetailModal
          trace={trace as Parameters<typeof TraceDetailModal>[0]['trace']}
          onClose={() => setShowTraceModal(false)}
        />
      )}

      {/* 承認フォームモーダル */}
      {showAcknowledgeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-foreground">
              アラート承認 — {athleteName}
            </h3>
            <AcknowledgeForm
              traceId={trace.trace_id}
              onSuccess={(action) => {
                setIsAcknowledged(true);
                setShowAcknowledgeForm(false);
              }}
              onCancel={() => setShowAcknowledgeForm(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

function QuickMetric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">
        {value !== undefined ? value.toFixed(2) : '-'}
      </p>
    </div>
  );
}
