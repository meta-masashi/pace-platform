'use client';

/**
 * コンディショニングアセスメント — タブコンテナ
 *
 * Tab 1: 負荷集中分析
 * Tab 2: 運動効率分析
 * Tab 3: 疼痛パターン分析
 * Tab 4: 総合評価
 */

import { useState, useEffect } from 'react';
import { LoadAnalysisTab } from './tab-load-analysis';
import { EfficiencyAnalysisTab } from './tab-efficiency-analysis';
import { PainAnalysisTab } from './tab-pain-analysis';
import { SummaryTab } from './tab-summary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssessmentData {
  athlete: {
    id: string;
    name: string;
    sport: string;
    position: string | null;
    number: number | null;
  };
  pipeline: {
    traceId: string;
    decision: string;
    priority: string;
    timestamp: string;
  } | null;
  loadAnalysis: LoadAnalysisData;
  efficiencyAnalysis: EfficiencyAnalysisData;
  painAnalysis: PainAnalysisData;
  dataPoints: number;
  dateRange: { from: string; to: string };
}

export interface LoadAnalysisData {
  acwr: { current: number; trend: { date: string; value: number }[] };
  acuteLoad: number;
  chronicLoad: number;
  acuteLoadChangePercent: number;
  monotony: { current: number; trend: { week: string; value: number }[] };
  strain: number;
  tissueDamage: Record<string, { value: number; halfLifeDays: number }>;
  preparedness: { current: number; trend: { date: string; value: number }[] };
}

export interface EfficiencyAnalysisData {
  decoupling: { current: number; trend: { date: string; value: number }[] };
  subjectiveObjectiveGap: { date: string; srpe: number; hrBased: number; gapPercent: number }[];
  zScores: Record<string, number>;
  zScoreAlertCount: number;
  performanceEfficiency: {
    outputPerHrCost: { current: number; average: number; deviationPercent: number };
    srpeToLoadRatio: { current: number; average: number; deviationPercent: number };
    recoveryHr: { current: number; average: number; deviationPercent: number };
    sleepEfficiency: { current: number; average: number; deviationPercent: number };
  };
  overallEfficiencyScore: number;
}

export interface PainAnalysisData {
  nrsTrend: { date: string; nrs: number; srpe: number }[];
  nrsLoadCorrelation: number;
  bodyMapTimeline: unknown[];
  patterns: string[];
  medicalHistory: { bodyPart: string; condition: string; date: string; severity: string; riskMultiplier: number }[];
  compensationAlert: string | null;
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const tabs = [
  { id: 'load', label: '負荷集中' },
  { id: 'efficiency', label: '運動効率' },
  { id: 'pain', label: '疼痛パターン' },
  { id: 'summary', label: '総合評価' },
] as const;

type TabId = (typeof tabs)[number]['id'];

// Decision badge
const decisionConfig: Record<string, { label: string; className: string }> = {
  RED: { label: 'RED', className: 'bg-critical-500/10 text-critical-500 border-critical-500/30' },
  ORANGE: { label: 'ORANGE', className: 'bg-watchlist-500/10 text-watchlist-500 border-watchlist-500/30' },
  YELLOW: { label: 'YELLOW', className: 'bg-watchlist-500/10 text-watchlist-500 border-watchlist-500/30' },
  GREEN: { label: 'GREEN', className: 'bg-optimal-500/10 text-optimal-500 border-optimal-500/30' },
};

const priorityLabels: Record<string, string> = {
  P1_SAFETY: 'P1: 安全',
  P2_MECHANICAL_RISK: 'P2: 負荷超過',
  P3_DECOUPLING: 'P3: 効率低下',
  P4_GAS_EXHAUSTION: 'P4: 蓄積疲労',
  P5_NORMAL: 'P5: 正常',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AssessmentTabsProps {
  athleteId: string;
}

export function AssessmentTabs({ athleteId }: AssessmentTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('load');
  const [data, setData] = useState<AssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/assessment/conditioning/${athleteId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled && json.success) {
          setData(json.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [athleteId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-critical-500/20 bg-critical-500/5 p-6 text-center">
        <p className="text-sm text-critical-500">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const decision = data.pipeline ? decisionConfig[data.pipeline.decision] : null;
  const priority = data.pipeline ? priorityLabels[data.pipeline.priority] : null;

  return (
    <div className="space-y-4">
      {/* Pipeline decision header */}
      {data.pipeline && decision && (
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${decision.className}`}>
            {decision.label}
          </span>
          {priority && (
            <span className="text-sm text-muted-foreground">{priority}</span>
          )}
          <span className="text-xs text-muted-foreground">
            データ: {data.dataPoints}日分 ({data.dateRange.from} ~ {data.dateRange.to})
          </span>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'load' && (
          <LoadAnalysisTab data={data.loadAnalysis} />
        )}
        {activeTab === 'efficiency' && (
          <EfficiencyAnalysisTab data={data.efficiencyAnalysis} />
        )}
        {activeTab === 'pain' && (
          <PainAnalysisTab data={data.painAnalysis} />
        )}
        {activeTab === 'summary' && (
          <SummaryTab data={data} />
        )}
      </div>
    </div>
  );
}
