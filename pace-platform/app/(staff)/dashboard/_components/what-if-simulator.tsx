'use client';

import { useCallback, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimulationParams {
  loadPercent: number;
  excludeSprints: boolean;
  applyTaping: boolean;
  switchToLowIntensity: boolean;
}

export interface SimulationResult {
  predictedDamage: Record<string, number>;
  marginToCritical: number; // 0-100
  riskBefore: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';
  riskAfter: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';
  evidenceMessage: string;
}

export interface WhatIfSimulatorProps {
  athleteId: string;
  currentLoad: number;
  currentDamage: Record<string, number>;
  onSimulate: (params: SimulationParams) => Promise<SimulationResult>;
}

// ---------------------------------------------------------------------------
// Risk color helpers
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  RED: { bg: 'bg-pulse-red-500', text: 'text-pulse-red-500', label: 'RED' },
  ORANGE: { bg: 'bg-orange-500', text: 'text-orange-400', label: 'ORANGE' },
  YELLOW: { bg: 'bg-amber-caution-500', text: 'text-amber-caution-500', label: 'YELLOW' },
  GREEN: { bg: 'bg-emerald-500', text: 'text-emerald-400', label: 'GREEN' },
};

function marginColor(margin: number): string {
  if (margin >= 40) return '#10B981';
  if (margin >= 20) return '#FF9F29';
  return '#FF4B4B';
}

// ---------------------------------------------------------------------------
// Bar Chart (before/after damage comparison)
// ---------------------------------------------------------------------------

function DamageComparison({
  before,
  after,
}: {
  before: Record<string, number>;
  after: Record<string, number>;
}) {
  const regions = useMemo(() => {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return Array.from(keys)
      .map((k) => ({
        id: k,
        before: before[k] ?? 0,
        after: after[k] ?? 0,
      }))
      .sort((a, b) => b.before - a.before)
      .slice(0, 5); // top 5 regions
  }, [before, after]);

  if (regions.length === 0) {
    return <div className="text-xs text-muted-foreground">ダメージデータなし</div>;
  }

  const REGION_LABELS: Record<string, string> = {
    left_knee: '左膝',
    right_knee: '右膝',
    left_ankle: '左足首',
    right_ankle: '右足首',
    left_hip: '左股関節',
    right_hip: '右股関節',
    lower_back: '腰部',
    left_shoulder: '左肩',
    right_shoulder: '右肩',
    core: '体幹',
    chest: '胸部',
    head_neck: '頸部',
    left_elbow: '左肘',
    right_elbow: '右肘',
    left_wrist: '左手首',
    right_wrist: '右手首',
    metabolic: '代謝系',
    structural_soft: '軟部組織',
    structural_hard: '硬組織',
    neuromotor: '神経運動',
  };

  return (
    <div className="space-y-2">
      <p className="text-2xs font-medium text-muted-foreground">明日の予測ダメージ（上位5部位）</p>
      {regions.map((r) => (
        <div key={r.id} className="space-y-0.5">
          <div className="flex items-center justify-between text-2xs">
            <span className="text-muted-foreground">{REGION_LABELS[r.id] ?? r.id}</span>
            <span className="font-mono text-card-foreground">
              {Math.round(r.before)}% → {Math.round(r.after)}%
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            {/* Before bar (dimmed) */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-pulse-red-500 opacity-30"
              style={{ width: `${Math.min(r.before, 100)}%` }}
            />
            {/* After bar */}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(r.after, 100)}%`,
                backgroundColor: r.after > 80 ? '#FF4B4B' : r.after > 60 ? '#FF9F29' : '#10B981',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function WhatIfSimulator({
  athleteId,
  currentLoad,
  currentDamage,
  onSimulate,
}: WhatIfSimulatorProps) {
  const [loadPercent, setLoadPercent] = useState(currentLoad);
  const [excludeSprints, setExcludeSprints] = useState(false);
  const [applyTaping, setApplyTaping] = useState(false);
  const [switchToLow, setSwitchToLow] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    try {
      const params: SimulationParams = {
        loadPercent,
        excludeSprints,
        applyTaping,
        switchToLowIntensity: switchToLow,
      };
      const res = await onSimulate(params);
      setResult(res);
    } catch (err) {
      console.error('[WhatIfSimulator] シミュレーションエラー:', err);
    } finally {
      setSimulating(false);
    }
  }, [loadPercent, excludeSprints, applyTaping, switchToLow, onSimulate]);

  // Auto-simulate on parameter change (debounced by user clicking)
  const riskBefore = result?.riskBefore;
  const riskAfter = result?.riskAfter;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-card-foreground">
          What-If シミュレータ
        </h3>
        <span className="text-2xs text-muted-foreground">ID: {athleteId.slice(0, 8)}</span>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        {/* Load Slider */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="load-slider" className="text-xs font-medium text-card-foreground">
              今日の練習負荷
            </label>
            <span className="font-mono text-sm font-bold text-cyber-cyan-500">
              {loadPercent}%
            </span>
          </div>
          <input
            id="load-slider"
            type="range"
            min={0}
            max={100}
            value={loadPercent}
            onChange={(e) => setLoadPercent(Number(e.target.value))}
            className="slider-whatif h-2 w-full cursor-pointer appearance-none rounded-full bg-muted"
          />
          <div className="mt-0.5 flex justify-between text-2xs text-muted-foreground">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Toggle switches */}
        <div className="space-y-2">
          <ToggleSwitch
            id="exclude-sprints"
            label="スプリント除外"
            checked={excludeSprints}
            onChange={setExcludeSprints}
          />
          <ToggleSwitch
            id="apply-taping"
            label="テーピング適用"
            checked={applyTaping}
            onChange={setApplyTaping}
          />
          <ToggleSwitch
            id="switch-low"
            label="低強度メニューに変更"
            checked={switchToLow}
            onChange={setSwitchToLow}
          />
        </div>

        {/* Simulate button */}
        <button
          type="button"
          onClick={handleSimulate}
          disabled={simulating}
          className="w-full rounded-md bg-cyber-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyber-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyber-cyan-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {simulating ? 'シミュレーション中...' : 'シミュレーション実行'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {/* Risk transition */}
          <div className="flex items-center justify-center gap-3">
            {riskBefore && (
              <span
                className={`rounded-md px-3 py-1 text-xs font-bold text-white ${RISK_COLORS[riskBefore]?.bg ?? 'bg-gray-500'}`}
              >
                {RISK_COLORS[riskBefore]?.label ?? riskBefore}
              </span>
            )}
            <span className="text-lg text-muted-foreground">→</span>
            {riskAfter && (
              <span
                className={`rounded-md px-3 py-1 text-xs font-bold text-white ${RISK_COLORS[riskAfter]?.bg ?? 'bg-gray-500'} ${
                  riskBefore !== riskAfter ? 'animate-risk-transition' : ''
                }`}
              >
                {RISK_COLORS[riskAfter]?.label ?? riskAfter}
              </span>
            )}
          </div>

          {/* Margin to critical */}
          <div className="text-center">
            <p className="text-2xs text-muted-foreground">臨界点までの余裕</p>
            <p
              className="mt-0.5 font-mono text-2xl font-bold"
              style={{ color: marginColor(result.marginToCritical) }}
            >
              {result.marginToCritical.toFixed(0)}%
            </p>
          </div>

          {/* Damage comparison bars */}
          <DamageComparison before={currentDamage} after={result.predictedDamage} />

          {/* Evidence message */}
          <div className="rounded-md border border-border bg-muted/50 p-3">
            <p className="text-xs leading-relaxed text-card-foreground">
              {result.evidenceMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------

function ToggleSwitch({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-xs text-card-foreground">
        {label}
      </label>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyber-cyan-500 focus:ring-offset-2 ${
          checked ? 'bg-cyber-cyan-500' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
