'use client';

/**
 * 総合評価タブ (Tab 4)
 *
 * - リスクサマリー（パイプライン判定 + 要因寄与度バー）
 * - 主要リスク指標サマリー（6 KPI ミニカード）
 * - 検出パターン一覧（3軸のアラート集約）
 * - スタッフ所見（カテゴリ選択 + 自由記述 + 保存）
 * - 推奨アクション（自動生成チェックリスト）
 */

import { useState } from 'react';
import Link from 'next/link';
import type {
  LoadAnalysisData,
  EfficiencyAnalysisData,
  PainAnalysisData,
} from './assessment-tabs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryTabProps {
  data: {
    athlete: { id: string; name: string; sport: string; position: string | null; number: number | null };
    pipeline: { traceId: string; decision: string; priority: string; timestamp: string } | null;
    loadAnalysis: LoadAnalysisData;
    efficiencyAnalysis: EfficiencyAnalysisData;
    painAnalysis: PainAnalysisData;
    dataPoints: number;
    dateRange: { from: string; to: string };
  };
  onSave?: (assessment: { riskCategory: string; staffNotes: string }) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const decisionConfig: Record<string, { label: string; className: string; dotColor: string }> = {
  RED: { label: 'RED', className: 'bg-critical-500/10 text-critical-500 border-critical-500/30', dotColor: 'bg-critical-500' },
  ORANGE: { label: 'ORANGE', className: 'bg-watchlist-500/10 text-watchlist-500 border-watchlist-500/30', dotColor: 'bg-watchlist-500' },
  YELLOW: { label: 'YELLOW', className: 'bg-watchlist-500/10 text-watchlist-500 border-watchlist-500/30', dotColor: 'bg-watchlist-500' },
  GREEN: { label: 'GREEN', className: 'bg-optimal-500/10 text-optimal-500 border-optimal-500/30', dotColor: 'bg-optimal-500' },
};

const priorityLabels: Record<string, string> = {
  P1_SAFETY: 'P1: 安全',
  P2_MECHANICAL_RISK: 'P2: 負荷超過',
  P3_DECOUPLING: 'P3: 効率低下',
  P4_GAS_EXHAUSTION: 'P4: 蓄積疲労',
  P5_NORMAL: 'P5: 正常',
};

const riskCategories = [
  { value: 'overreaching', label: '過負荷' },
  { value: 'accumulated_fatigue', label: '蓄積疲労' },
  { value: 'pain_management', label: '疼痛管理必要' },
  { value: 'observation', label: '経過観察のみ' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Compute factor contribution percentages for the bar chart */
function computeFactorBars(
  load: LoadAnalysisData,
  eff: EfficiencyAnalysisData,
  pain: PainAnalysisData,
) {
  // Load factor: how far ACWR deviates from 1.0 (ideal)
  const loadScore = clamp(Math.abs(load.acwr.current - 1.0) / 1.0, 0, 1) * 100;

  // Efficiency factor: decoupling contribution + efficiency score inversion
  const decouplingPart = clamp(Math.abs(eff.decoupling.current) / 10, 0, 1);
  const efficiencyPart = clamp((100 - eff.overallEfficiencyScore) / 100, 0, 1);
  const effScore = ((decouplingPart + efficiencyPart) / 2) * 100;

  // Pain factor: NRS correlation + rising pattern signals
  const correlationPart = clamp(Math.abs(pain.nrsLoadCorrelation), 0, 1);
  const patternPart = pain.patterns.length > 0 ? 0.5 : 0;
  const painScore = clamp(((correlationPart + patternPart) / 1.5) * 100, 0, 100);

  return [
    { label: '負荷要因', value: Math.round(loadScore), color: 'bg-critical-500' },
    { label: '効率要因', value: Math.round(effScore), color: 'bg-watchlist-500' },
    { label: '疼痛要因', value: Math.round(painScore), color: 'bg-cyber-cyan-500' },
  ];
}

type StatusLevel = 'good' | 'warning' | 'alert';

function statusIndicator(level: StatusLevel) {
  const colors: Record<StatusLevel, string> = {
    good: 'bg-optimal-500',
    warning: 'bg-watchlist-500',
    alert: 'bg-critical-500',
  };
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${colors[level]}`} />
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Mini KPI card */
function MiniKpi({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: StatusLevel;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        {statusIndicator(status)}
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/** Alert list item */
function AlertItem({ text, severity }: { text: string; severity: 'high' | 'medium' | 'low' }) {
  const icons: Record<string, string> = {
    high: '!!',
    medium: '!',
    low: 'i',
  };
  const colors: Record<string, string> = {
    high: 'bg-critical-500/10 text-critical-500 border-critical-500/30',
    medium: 'bg-watchlist-500/10 text-watchlist-500 border-watchlist-500/30',
    low: 'bg-cyber-cyan-500/10 text-cyber-cyan-500 border-cyber-cyan-500/30',
  };
  return (
    <div className={`flex items-start gap-3 rounded-md border px-3 py-2 ${colors[severity]}`}>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs font-bold">
        {icons[severity]}
      </span>
      <span className="text-sm">{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SummaryTab({ data, onSave }: SummaryTabProps) {
  const [riskCategory, setRiskCategory] = useState('observation');
  const [staffNotes, setStaffNotes] = useState('');

  const { loadAnalysis, efficiencyAnalysis, painAnalysis, pipeline } = data;

  const decision = pipeline ? decisionConfig[pipeline.decision] : null;
  const priority = pipeline ? priorityLabels[pipeline.priority] ?? pipeline.priority : null;

  // Factor contribution bars
  const factorBars = computeFactorBars(loadAnalysis, efficiencyAnalysis, painAnalysis);

  // KPI status levels
  const acwrStatus: StatusLevel =
    loadAnalysis.acwr.current > 1.5 ? 'alert' : loadAnalysis.acwr.current > 1.3 ? 'warning' : 'good';
  const monotonyStatus: StatusLevel =
    loadAnalysis.monotony.current > 2.0 ? 'alert' : loadAnalysis.monotony.current > 1.5 ? 'warning' : 'good';
  const strainStatus: StatusLevel =
    loadAnalysis.strain > 6000 ? 'alert' : loadAnalysis.strain > 4000 ? 'warning' : 'good';
  const decouplingStatus: StatusLevel =
    Math.abs(efficiencyAnalysis.decoupling.current) > 5 ? 'alert' : Math.abs(efficiencyAnalysis.decoupling.current) > 3 ? 'warning' : 'good';
  const efficiencyStatus: StatusLevel =
    efficiencyAnalysis.overallEfficiencyScore < 50 ? 'alert' : efficiencyAnalysis.overallEfficiencyScore < 70 ? 'warning' : 'good';
  const nrsCorrelationStatus: StatusLevel =
    Math.abs(painAnalysis.nrsLoadCorrelation) > 0.7 ? 'alert' : Math.abs(painAnalysis.nrsLoadCorrelation) > 0.4 ? 'warning' : 'good';

  // Collect alerts from all 3 axes
  const alerts: { text: string; severity: 'high' | 'medium' | 'low' }[] = [];

  // Load alerts
  if (loadAnalysis.acwr.current > 1.5) {
    alerts.push({ text: `ACWR が ${loadAnalysis.acwr.current.toFixed(2)} で過負荷域（> 1.5）`, severity: 'high' });
  }
  if (loadAnalysis.monotony.current > 2.0) {
    alerts.push({ text: `練習の単調さが ${loadAnalysis.monotony.current.toFixed(2)} で高水準（> 2.0）`, severity: 'medium' });
  }
  if (Math.abs(loadAnalysis.acuteLoadChangePercent) > 15) {
    alerts.push({ text: `急性負荷の変化率が ${loadAnalysis.acuteLoadChangePercent > 0 ? '+' : ''}${loadAnalysis.acuteLoadChangePercent.toFixed(1)}%（> 15%）`, severity: 'medium' });
  }

  // Efficiency alerts
  if (Math.abs(efficiencyAnalysis.decoupling.current) > 5) {
    alerts.push({ text: `心拍-出力の乖離度が ${efficiencyAnalysis.decoupling.current.toFixed(1)}%（> 5%）`, severity: 'high' });
  }
  if (efficiencyAnalysis.zScoreAlertCount > 0) {
    alerts.push({ text: `Z-Score 異常値が ${efficiencyAnalysis.zScoreAlertCount} 件検出`, severity: 'medium' });
  }

  // Pain alerts
  if (painAnalysis.patterns.length > 0) {
    painAnalysis.patterns.forEach((pattern) => {
      alerts.push({ text: pattern, severity: 'medium' });
    });
  }
  if (painAnalysis.compensationAlert) {
    alerts.push({ text: `代償パターン: ${painAnalysis.compensationAlert}`, severity: 'high' });
  }

  // Recommended actions
  const recommendations: { text: string; active: boolean }[] = [
    {
      text: '負荷量の段階的軽減を検討',
      active: loadAnalysis.acwr.current > 1.5,
    },
    {
      text: '練習メニューにバリエーションを追加',
      active: loadAnalysis.monotony.current > 2.0,
    },
    {
      text: '回復状態の確認（HRVモニタリング推奨）',
      active: Math.abs(efficiencyAnalysis.decoupling.current) > 5,
    },
    {
      text: '疼痛管理プロトコルの適用を検討',
      active: painAnalysis.patterns.some((p) => p.toLowerCase().includes('rising') || p.toLowerCase().includes('上昇') || p.includes('増加')),
    },
    {
      text: '代償パターンの評価を実施',
      active: painAnalysis.compensationAlert !== null,
    },
  ];

  const activeRecommendations = recommendations.filter((r) => r.active);
  const inactiveRecommendations = recommendations.filter((r) => !r.active);

  function handleSave() {
    onSave?.({ riskCategory, staffNotes });
  }

  return (
    <div className="space-y-4">
      {/* ================================================================== */}
      {/* 1. リスクサマリー */}
      {/* ================================================================== */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          リスクサマリー
        </h4>

        {/* Decision badge */}
        {pipeline && decision && (
          <div className="mb-4 flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${decision.className}`}
            >
              <span className={`h-2 w-2 rounded-full ${decision.dotColor}`} />
              {decision.label}
            </span>
            {priority && (
              <span className="text-sm text-muted-foreground">{priority}</span>
            )}
          </div>
        )}

        {/* Factor contribution bars */}
        <div className="space-y-3">
          {factorBars.map((bar) => (
            <div key={bar.label}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">{bar.label}</span>
                <span className="text-xs font-bold tabular-nums text-foreground">{bar.value}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${bar.color}`}
                  style={{ width: `${bar.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================================================================== */}
      {/* 2. 主要リスク指標サマリー */}
      {/* ================================================================== */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          主要リスク指標サマリー
        </h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MiniKpi
            label="ACWR"
            value={loadAnalysis.acwr.current.toFixed(2)}
            status={acwrStatus}
          />
          <MiniKpi
            label="練習の単調さ"
            value={loadAnalysis.monotony.current.toFixed(2)}
            status={monotonyStatus}
          />
          <MiniKpi
            label="蓄積疲労度"
            value={loadAnalysis.strain.toFixed(0)}
            status={strainStatus}
          />
          <MiniKpi
            label="心拍-出力の乖離度"
            value={`${efficiencyAnalysis.decoupling.current.toFixed(1)}%`}
            status={decouplingStatus}
          />
          <MiniKpi
            label="総合効率スコア"
            value={efficiencyAnalysis.overallEfficiencyScore.toFixed(0)}
            status={efficiencyStatus}
          />
          <MiniKpi
            label="NRS相関"
            value={painAnalysis.nrsLoadCorrelation.toFixed(2)}
            status={nrsCorrelationStatus}
          />
        </div>
      </div>

      {/* ================================================================== */}
      {/* 3. 検出パターン一覧 */}
      {/* ================================================================== */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          検出パターン一覧
        </h4>
        {alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <AlertItem key={i} text={alert.text} severity={alert.severity} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            現在、注意が必要なパターンは検出されていません
          </p>
        )}
      </div>

      {/* ================================================================== */}
      {/* 4. スタッフ所見 */}
      {/* ================================================================== */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          スタッフ所見
        </h4>

        {/* Risk category selector */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-muted-foreground">リスクカテゴリ</p>
          <div className="flex flex-wrap gap-2">
            {riskCategories.map((cat) => (
              <label
                key={cat.value}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  riskCategory === cat.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                <input
                  type="radio"
                  name="riskCategory"
                  value={cat.value}
                  checked={riskCategory === cat.value}
                  onChange={(e) => setRiskCategory(e.target.value)}
                  className="sr-only"
                />
                <span
                  className={`h-3 w-3 rounded-full border-2 ${
                    riskCategory === cat.value
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40 bg-transparent'
                  }`}
                />
                {cat.label}
              </label>
            ))}
          </div>
        </div>

        {/* Staff notes textarea */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-muted-foreground">所見メモ</p>
          <textarea
            value={staffNotes}
            onChange={(e) => setStaffNotes(e.target.value)}
            rows={4}
            placeholder="選手の状態に関する所見や申し送り事項を記入してください..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!onSave}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          所見を保存
        </button>
      </div>

      {/* ================================================================== */}
      {/* 5. 推奨アクション */}
      {/* ================================================================== */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          推奨アクション
        </h4>

        {activeRecommendations.length > 0 ? (
          <div className="space-y-2">
            {activeRecommendations.map((rec, i) => (
              <label key={i} className="flex items-start gap-3 rounded-md border border-watchlist-500/20 bg-watchlist-500/5 px-3 py-2.5">
                <input
                  type="checkbox"
                  readOnly
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                />
                <span className="text-sm text-foreground">{rec.text}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            現時点で推奨される特別な対応はありません
          </p>
        )}

        {/* Show inactive recommendations as greyed out for completeness */}
        {inactiveRecommendations.length > 0 && activeRecommendations.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-2xs text-muted-foreground">該当なし:</p>
            {inactiveRecommendations.map((rec, i) => (
              <label key={i} className="flex items-start gap-3 px-3 py-1.5 opacity-40">
                <input
                  type="checkbox"
                  readOnly
                  disabled
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                />
                <span className="text-xs text-muted-foreground">{rec.text}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 6. シミュレータへのリンク */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          介入シミュレーション
        </h4>
        <p className="mb-3 text-xs text-muted-foreground">
          負荷変更や介入策の効果をシミュレーションで事前に確認できます
        </p>
        <div className="flex gap-3">
          <Link
            href={`/simulator/conditioning?athleteId=${data.athlete.id}`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            コンディショニング・シミュレータ
          </Link>
        </div>
      </div>
    </div>
  );
}
