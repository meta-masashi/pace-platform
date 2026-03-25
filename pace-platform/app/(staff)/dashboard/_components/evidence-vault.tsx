'use client';

import { useCallback, useState } from 'react';
import type {
  InferenceTraceLog,
  InferencePriority,
  FeatureVector,
  InferenceOutput,
  DailyInput,
} from '@/lib/engine/v6/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvidenceVaultProps {
  traceLog: InferenceTraceLog;
  isExpanded?: boolean;
}

// ---------------------------------------------------------------------------
// Priority badge config
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<
  InferencePriority,
  { label: string; color: string; bgClass: string }
> = {
  P1_SAFETY: {
    label: 'P1: 安全停止',
    color: '#FF4B4B',
    bgClass: 'bg-pulse-red-500/20 text-pulse-red-500 border-pulse-red-500/30',
  },
  P2_MECHANICAL_RISK: {
    label: 'P2: 力学的リスク',
    color: '#F97316',
    bgClass: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  P3_DECOUPLING: {
    label: 'P3: デカップリング',
    color: '#FF9F29',
    bgClass: 'bg-amber-caution-500/20 text-amber-caution-500 border-amber-caution-500/30',
  },
  P4_GAS_EXHAUSTION: {
    label: 'P4: 蓄積疲労',
    color: '#00F2FF',
    bgClass: 'bg-cyber-cyan-500/20 text-cyber-cyan-500 border-cyber-cyan-500/30',
  },
  P5_NORMAL: {
    label: 'P5: 正常',
    color: '#10B981',
    bgClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
};

const DECISION_COLORS: Record<string, string> = {
  RED: 'text-pulse-red-500',
  ORANGE: 'text-orange-400',
  YELLOW: 'text-amber-caution-500',
  GREEN: 'text-emerald-400',
};

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-card-foreground hover:bg-muted/30"
      >
        <span>{title}</span>
        <ChevronIcon open={isOpen} />
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Data Tables
// ---------------------------------------------------------------------------

function KeyValueTable({ data }: { data: Array<[string, string | number]> }) {
  return (
    <table className="w-full text-2xs">
      <tbody>
        {data.map(([key, value], i) => (
          <tr key={i} className="border-b border-border/50 last:border-b-0">
            <td className="py-1 pr-3 text-muted-foreground">{key}</td>
            <td className="py-1 font-mono text-card-foreground">{typeof value === 'number' ? value.toFixed(4) : value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function InputDataSection({ inputs }: { inputs: DailyInput }) {
  const rows: Array<[string, string | number]> = [
    ['日付', inputs.date],
    ['sRPE', inputs.sRPE],
    ['トレーニング時間 (分)', inputs.trainingDurationMin],
    ['セッション負荷', inputs.sessionLoad],
    ['睡眠の質', inputs.subjectiveScores.sleepQuality],
    ['疲労度', inputs.subjectiveScores.fatigue],
    ['筋肉痛', inputs.subjectiveScores.muscleSoreness],
    ['ストレス', inputs.subjectiveScores.stressLevel],
    ['痛みNRS', inputs.subjectiveScores.painNRS],
    ['気分', inputs.subjectiveScores.mood],
  ];
  if (inputs.subjectiveScores.restingHeartRate !== undefined) {
    rows.push(['安静時心拍数', inputs.subjectiveScores.restingHeartRate]);
  }
  if (inputs.objectiveLoad) {
    if (inputs.objectiveLoad.distanceKm !== undefined) rows.push(['走行距離 (km)', inputs.objectiveLoad.distanceKm]);
    if (inputs.objectiveLoad.playerLoad !== undefined) rows.push(['PlayerLoad', inputs.objectiveLoad.playerLoad]);
    if (inputs.objectiveLoad.sprintCount !== undefined) rows.push(['スプリント回数', inputs.objectiveLoad.sprintCount]);
    if (inputs.objectiveLoad.impactG !== undefined) rows.push(['衝撃G', inputs.objectiveLoad.impactG]);
    rows.push(['デバイス信頼性 κ', inputs.objectiveLoad.deviceKappa]);
  }
  return <KeyValueTable data={rows} />;
}

function AppliedConstantsSection({ constants }: { constants: Record<string, unknown> }) {
  const rows: Array<[string, string | number]> = Object.entries(constants).map(([key, val]) => [
    key,
    typeof val === 'number' ? val : JSON.stringify(val),
  ]);
  if (rows.length === 0) {
    return <p className="text-2xs text-muted-foreground">適用された定数はありません</p>;
  }
  return <KeyValueTable data={rows} />;
}

function MetricsSection({ metrics }: { metrics: FeatureVector }) {
  const rows: Array<[string, string | number]> = [
    ['ACWR', metrics.acwr],
    ['Monotony Index', metrics.monotonyIndex],
    ['Preparedness', metrics.preparedness],
  ];
  if (metrics.decouplingScore !== undefined) {
    rows.push(['デカップリング', metrics.decouplingScore]);
  }
  if (metrics.structuralVulnerability !== undefined) {
    rows.push(['構造的脆弱性 Φ', metrics.structuralVulnerability]);
  }
  // Tissue damage
  for (const [cat, dmg] of Object.entries(metrics.tissueDamage)) {
    rows.push([`D(t): ${cat}`, dmg]);
  }
  return <KeyValueTable data={rows} />;
}

function BayesianSection({ inference }: { inference: InferenceOutput }) {
  return (
    <div className="space-y-2">
      {/* Formula display */}
      <div className="katex-container rounded border border-border/50 bg-muted/30 px-3 py-2 font-mono text-2xs text-card-foreground">
        P(risk|data) = P(data|risk) &times; P(risk) / P(data)
      </div>

      {/* Posteriors */}
      <p className="text-2xs font-medium text-muted-foreground">事後確率</p>
      <KeyValueTable
        data={Object.entries(inference.posteriorProbabilities).map(([k, v]) => [k, v])}
      />

      {/* Risk Scores */}
      <p className="mt-2 text-2xs font-medium text-muted-foreground">リスクスコア</p>
      <KeyValueTable
        data={Object.entries(inference.riskScores).map(([k, v]) => [k, v])}
      />

      {/* Confidence Intervals */}
      {Object.keys(inference.confidenceIntervals).length > 0 && (
        <>
          <p className="mt-2 text-2xs font-medium text-muted-foreground">95% 信頼区間</p>
          <KeyValueTable
            data={Object.entries(inference.confidenceIntervals).map(([k, [lo, hi]]) => [
              k,
              `[${lo.toFixed(3)}, ${hi.toFixed(3)}]`,
            ])}
          />
        </>
      )}
    </div>
  );
}

function DeviceReliability({ kappa }: { kappa: number | undefined }) {
  if (kappa === undefined) {
    return <span className="text-2xs text-muted-foreground">デバイスデータなし</span>;
  }
  let trustLabel: string;
  let trustClass: string;
  if (kappa >= 0.8) {
    trustLabel = '高信頼';
    trustClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  } else if (kappa >= 0.5) {
    trustLabel = '中信頼';
    trustClass = 'bg-amber-caution-500/20 text-amber-caution-500 border-amber-caution-500/30';
  } else {
    trustLabel = '低信頼';
    trustClass = 'bg-pulse-red-500/20 text-pulse-red-500 border-pulse-red-500/30';
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-card-foreground">
        κ = {kappa.toFixed(3)}
      </span>
      <span className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${trustClass}`}>
        {trustLabel}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EvidenceVault({ traceLog, isExpanded: defaultExpanded = false }: EvidenceVaultProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpand = useCallback(() => setExpanded((prev) => !prev), []);

  const snap = traceLog.inferenceSnapshot;
  const priorityInfo = PRIORITY_CONFIG[snap.triggeredRule];
  const decisionColor = DECISION_COLORS[snap.decision] ?? 'text-card-foreground';

  // Node execution summary
  const nodeEntries = Object.entries(snap.nodeResults);

  // Device kappa
  const deviceKappa = snap.inputs.objectiveLoad?.deviceKappa;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <button
        type="button"
        onClick={toggleExpand}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <VaultIcon className="h-4 w-4 text-cyber-cyan-500" />
          <h3 className="text-sm font-bold text-card-foreground">
            推論根拠（Evidence Vault）
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Priority badge */}
          <span className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${priorityInfo.bgClass}`}>
            {priorityInfo.label}
          </span>
          <ChevronIcon open={expanded} />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border">
          {/* Decision summary */}
          <div className="flex items-center gap-4 px-4 py-3">
            <div>
              <p className="text-2xs text-muted-foreground">判定</p>
              <p className={`font-mono text-lg font-bold ${decisionColor}`}>
                {snap.decision}
              </p>
            </div>
            <div className="flex-1">
              <p className="text-2xs text-muted-foreground">判定理由</p>
              <p className="text-xs text-card-foreground">{snap.decisionReason}</p>
            </div>
          </div>

          {/* Overrides applied */}
          {snap.overridesApplied.length > 0 && (
            <div className="border-t border-border px-4 py-2">
              <p className="text-2xs text-muted-foreground">適用されたオーバーライド</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {snap.overridesApplied.map((o, i) => (
                  <span
                    key={i}
                    className="rounded border border-amber-caution-500/30 bg-amber-caution-500/10 px-2 py-0.5 text-2xs text-amber-caution-500"
                  >
                    {o}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible sections */}
          <CollapsibleSection title="入力データ">
            <InputDataSection inputs={snap.inputs} />
          </CollapsibleSection>

          <CollapsibleSection title="適用された定数">
            <AppliedConstantsSection constants={snap.appliedConstants} />
          </CollapsibleSection>

          <CollapsibleSection title="計算メトリクス">
            <MetricsSection metrics={snap.calculatedMetrics} />
          </CollapsibleSection>

          <CollapsibleSection title="ベイズ計算">
            <BayesianSection inference={snap.bayesianComputation} />
          </CollapsibleSection>

          {/* Device reliability */}
          <div className="border-b border-border px-3 py-2">
            <p className="mb-1 text-2xs font-medium text-muted-foreground">デバイス信頼性</p>
            <DeviceReliability kappa={deviceKappa} />
          </div>

          {/* Data lineage — node execution */}
          <CollapsibleSection title="データリネージ（パイプライン実行）">
            <div className="space-y-1">
              {nodeEntries.map(([nodeId, res]) => (
                <div key={nodeId} className="flex items-center justify-between text-2xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        res.success ? 'bg-emerald-500' : 'bg-pulse-red-500'
                      }`}
                    />
                    <span className="font-mono text-muted-foreground">{nodeId}</span>
                  </div>
                  <span className="font-mono text-muted-foreground">
                    {res.executionTimeMs}ms
                  </span>
                </div>
              ))}
            </div>
            {nodeEntries.some(([, r]) => r.warnings.length > 0) && (
              <div className="mt-2 space-y-1">
                <p className="text-2xs font-medium text-amber-caution-500">警告:</p>
                {nodeEntries
                  .flatMap(([id, r]) => r.warnings.map((w) => ({ nodeId: id, warning: w })))
                  .map((w, i) => (
                    <p key={i} className="text-2xs text-amber-caution-400">
                      [{w.nodeId}] {w.warning}
                    </p>
                  ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Trace metadata */}
          <div className="bg-muted/20 px-3 py-2 text-2xs text-muted-foreground">
            <span>Trace ID: {traceLog.traceId.slice(0, 12)}...</span>
            <span className="mx-2">|</span>
            <span>v{traceLog.pipelineVersion}</span>
            <span className="mx-2">|</span>
            <span>{traceLog.timestampUtc}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline icon
// ---------------------------------------------------------------------------

function VaultIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
      <circle cx="12" cy="16" r="1" />
    </svg>
  );
}
