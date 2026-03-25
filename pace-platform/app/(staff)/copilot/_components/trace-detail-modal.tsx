'use client';

/**
 * PACE v6.0 — 推論トレース詳細モーダル
 *
 * ノード別実行タイムライン、特徴量ベクトル、ベイズ計算詳細、
 * 適用オーバーライド、法的免責条項を表示する。
 */

import { useEffect, useRef } from 'react';
import { LegalDisclaimer } from './legal-disclaimer';

interface TraceData {
  trace_id: string;
  athlete_id: string;
  timestamp_utc: string;
  pipeline_version: string;
  decision: string;
  priority: string;
  inference_snapshot: {
    inputs?: Record<string, unknown>;
    calculatedMetrics?: {
      acwr?: number;
      monotonyIndex?: number;
      preparedness?: number;
      tissueDamage?: Record<string, number>;
      zScores?: Record<string, number>;
      decouplingScore?: number;
    };
    bayesianComputation?: {
      riskScores?: Record<string, number>;
      posteriorProbabilities?: Record<string, number>;
      confidenceIntervals?: Record<string, [number, number]>;
    };
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

interface TraceDetailModalProps {
  trace: TraceData;
  onClose: () => void;
}

const DECISION_COLORS: Record<string, string> = {
  RED: 'text-[#DC2626]',
  ORANGE: 'text-[#EA580C]',
  YELLOW: 'text-[#CA8A04]',
  GREEN: 'text-[#16A34A]',
};

const DECISION_LABELS: Record<string, string> = {
  RED: '停止',
  ORANGE: '警戒',
  YELLOW: '注意',
  GREEN: '良好',
};

const PRIORITY_LABELS: Record<string, string> = {
  P1_SAFETY: '安全性（P1）',
  P2_MECHANICAL_RISK: '力学的リスク（P2）',
  P3_DECOUPLING: 'デカップリング（P3）',
  P4_GAS_EXHAUSTION: 'GAS 疲憊期（P4）',
  P5_NORMAL: '正常適応（P5）',
};

const NODE_LABELS: Record<string, string> = {
  node0_ingestion: 'Node 0: データ取り込み',
  node1_cleaning: 'Node 1: クリーニング',
  node2_feature: 'Node 2: 特徴量抽出',
  node3_inference: 'Node 3: 推論',
  node4_decision: 'Node 4: 判定',
  node5_presentation: 'Node 5: プレゼンテーション',
};

const TISSUE_LABELS: Record<string, string> = {
  metabolic: '代謝系',
  structural_soft: '軟部組織',
  structural_hard: '骨・関節',
  neuromotor: '神経筋',
};

const Z_SCORE_LABELS: Record<string, string> = {
  sleepQuality: '睡眠の質',
  fatigue: '疲労度',
  mood: '気分',
  muscleSoreness: '筋肉痛',
  stressLevel: 'ストレス',
  painNRS: '痛み',
};

const OVERRIDE_LABELS: Record<string, string> = {
  game_day: '試合日',
  acclimatization: '順化期間',
  weight_making: '減量期',
  pipeline_fallback: 'パイプラインフォールバック',
};

export function TraceDetailModal({ trace, onClose }: TraceDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  const snapshot = trace.inference_snapshot;
  const metrics = snapshot.calculatedMetrics;
  const bayesian = snapshot.bayesianComputation;
  const nodeResults = snapshot.nodeResults;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">推論トレース詳細</h2>
            <p className="text-xs text-muted-foreground">
              Trace ID: {trace.trace_id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="閉じる"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* 判定サマリー */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">判定結果</h3>
            <div className="grid grid-cols-2 gap-4 rounded-md border border-border p-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">判定</p>
                <p className={`text-lg font-bold ${DECISION_COLORS[trace.decision] ?? 'text-foreground'}`}>
                  {DECISION_LABELS[trace.decision] ?? trace.decision}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">優先度</p>
                <p className="text-sm font-medium text-foreground">
                  {PRIORITY_LABELS[trace.priority] ?? trace.priority}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">バージョン</p>
                <p className="text-sm text-foreground">{trace.pipeline_version}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">実行日時</p>
                <p className="text-sm text-foreground">
                  {new Date(trace.timestamp_utc).toLocaleString('ja-JP', {
                    timeZone: 'Asia/Tokyo',
                  })}
                </p>
              </div>
            </div>
            {snapshot.decisionReason && (
              <div className="mt-3 rounded-md bg-muted/50 p-3">
                <p className="text-xs font-semibold text-muted-foreground">判定理由</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {snapshot.decisionReason}
                </p>
              </div>
            )}
          </section>

          {/* ノード実行タイムライン */}
          {nodeResults && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">ノード実行タイムライン</h3>
              <div className="space-y-2">
                {Object.entries(nodeResults).map(([nodeId, result]) => (
                  <div
                    key={nodeId}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        result.success ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {NODE_LABELS[nodeId] ?? nodeId}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {result.executionTimeMs.toFixed(1)}ms
                    </span>
                    {result.warnings.length > 0 && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                        {result.warnings.length} 警告
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 特徴量ベクトル */}
          {metrics && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">特徴量ベクトル</h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <MetricCard label="ACWR" value={metrics.acwr?.toFixed(2) ?? '-'} warn={(metrics.acwr ?? 0) > 1.5} />
                <MetricCard label="単調性" value={metrics.monotonyIndex?.toFixed(2) ?? '-'} warn={(metrics.monotonyIndex ?? 0) > 2.0} />
                <MetricCard label="プレパレッドネス" value={metrics.preparedness?.toFixed(2) ?? '-'} warn={(metrics.preparedness ?? 0) <= 0} />
                {metrics.decouplingScore !== undefined && (
                  <MetricCard label="デカップリング" value={metrics.decouplingScore.toFixed(2)} warn={metrics.decouplingScore > 1.5} />
                )}
              </div>

              {/* 組織ダメージ */}
              {metrics.tissueDamage && Object.keys(metrics.tissueDamage).length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">組織別ダメージ</p>
                  <div className="space-y-2">
                    {Object.entries(metrics.tissueDamage).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-xs text-muted-foreground">
                          {TISSUE_LABELS[key] ?? key}
                        </span>
                        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full transition-all ${
                              val > 0.8 ? 'bg-[#DC2626]' : val > 0.5 ? 'bg-[#EA580C]' : 'bg-[#16A34A]'
                            }`}
                            style={{ width: `${Math.min(val * 100, 100)}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                          {val.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Z-Score */}
              {metrics.zScores && Object.keys(metrics.zScores).length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">主観指標 Z-Score</p>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {Object.entries(metrics.zScores).map(([key, val]) => (
                      <div
                        key={key}
                        className={`rounded-md border px-3 py-2 ${
                          val <= -1.5 ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' : 'border-border'
                        }`}
                      >
                        <p className="text-xs text-muted-foreground">
                          {Z_SCORE_LABELS[key] ?? key}
                        </p>
                        <p className={`text-sm font-semibold ${val <= -1.5 ? 'text-[#DC2626]' : 'text-foreground'}`}>
                          {val.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ベイズ計算 */}
          {bayesian && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">ベイズ計算結果</h3>
              {bayesian.posteriorProbabilities &&
                Object.keys(bayesian.posteriorProbabilities).length > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      事後確率
                    </p>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {Object.entries(bayesian.posteriorProbabilities).map(([key, val]) => (
                        <div key={key} className="text-sm">
                          <span className="text-muted-foreground">{key}: </span>
                          <span className="font-medium text-foreground">
                            {(val * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </section>
          )}

          {/* 適用されたオーバーライド */}
          {snapshot.overridesApplied && snapshot.overridesApplied.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">適用されたオーバーライド</h3>
              <div className="flex flex-wrap gap-2">
                {snapshot.overridesApplied.map((override) => (
                  <span
                    key={override}
                    className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  >
                    {OVERRIDE_LABELS[override] ?? override}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 承認情報 */}
          {trace.acknowledged_at && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">承認記録</h3>
              <div className="rounded-md border border-border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">アクション</p>
                    <p className="text-sm font-medium text-foreground">
                      {trace.acknowledge_action}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">承認者</p>
                    <p className="text-sm text-foreground">
                      {trace.acknowledged_staff_name ?? '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">日時</p>
                    <p className="text-sm text-foreground">
                      {new Date(trace.acknowledged_at).toLocaleString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 法的免責条項 */}
          <LegalDisclaimer />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メトリクスカード
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        warn
          ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
          : 'border-border'
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-bold ${
          warn ? 'text-[#DC2626]' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
