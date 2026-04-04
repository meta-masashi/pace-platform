'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';

// ---------------------------------------------------------------------------
// Dynamic Recharts imports (SSR disabled)
// ---------------------------------------------------------------------------

const LineChart = dynamic(
  () => import('recharts').then((m) => m.LineChart) as any,
  { ssr: false },
) as any;
const Line = dynamic(
  () => import('recharts').then((m) => m.Line) as any,
  { ssr: false },
) as any;
const XAxis = dynamic(
  () => import('recharts').then((m) => m.XAxis) as any,
  { ssr: false },
) as any;
const YAxis = dynamic(
  () => import('recharts').then((m) => m.YAxis) as any,
  { ssr: false },
) as any;
const CartesianGrid = dynamic(
  () => import('recharts').then((m) => m.CartesianGrid) as any,
  { ssr: false },
) as any;
const Tooltip = dynamic(
  () => import('recharts').then((m) => m.Tooltip) as any,
  { ssr: false },
) as any;
const ReferenceLine = dynamic(
  () => import('recharts').then((m) => m.ReferenceLine) as any,
  { ssr: false },
) as any;
const ReferenceArea = dynamic(
  () => import('recharts').then((m) => m.ReferenceArea) as any,
  { ssr: false },
) as any;
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer) as any,
  { ssr: false },
) as any;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyLoad {
  day: number;
  srpe: number;
  type: 'normal' | 'modified' | 'rehab' | 'rest';
}

interface ScenarioInput {
  name: string;
  dailyLoads: DailyLoad[];
}

interface AcwrPoint {
  day: number;
  acwr: number;
  acute: number;
  chronic: number;
}

interface MonotonyPoint {
  day: number;
  monotony: number;
  strain: number;
}

interface TissuePoint {
  day: number;
  value: number;
}

interface DecisionPoint {
  day: number;
  priority: string;
  decision: string;
}

interface ScenarioResult {
  name: string;
  acwrTrend: AcwrPoint[];
  monotonyTrend: MonotonyPoint[];
  tissueRecovery: Record<string, TissuePoint[]>;
  decisions: DecisionPoint[];
  sweetSpotReturn: number | null;
  score: number;
}

interface SimulationResponse {
  success: boolean;
  error?: string;
  data?: {
    baseline: {
      currentAcwr: number;
      currentMonotony: number;
      currentStrain: number;
      tissueDamage: Record<string, number>;
    };
    scenarios: ScenarioResult[];
    recommendedScenario: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCENARIO_COLORS = ['#059669', '#8b5cf6', '#f59e0b'];
const SCENARIO_DEFAULTS = ['シナリオA', 'シナリオB', 'シナリオC'];
const LOAD_TYPES = [
  { value: 'normal', label: '通常' },
  { value: 'modified', label: '調整' },
  { value: 'rehab', label: 'リハビリ' },
  { value: 'rest', label: '休養' },
] as const;

const PRESETS: { label: string; srpe: number; type: DailyLoad['type'] }[] = [
  { label: '完全休養', srpe: 0, type: 'rest' },
  { label: '軽負荷', srpe: 200, type: 'modified' },
  { label: '通常練習', srpe: 500, type: 'normal' },
  { label: '高負荷', srpe: 800, type: 'normal' },
];

const DECISION_COLORS: Record<string, string> = {
  P1: 'bg-red-600 text-white',
  P2: 'bg-orange-500 text-white',
  P3: 'bg-yellow-400 text-gray-900',
  P4: 'bg-green-400 text-gray-900',
  P5: 'bg-green-600 text-white',
};

const TISSUE_LABELS: Record<string, string> = {
  metabolic: '代謝系',
  structural_soft: '軟部組織',
  structural_hard: '硬組織',
  neuromotor: '神経筋',
};

const TISSUE_COLORS: Record<string, string> = {
  metabolic: '#ef4444',
  structural_soft: '#f59e0b',
  structural_hard: '#3b82f6',
  neuromotor: '#8b5cf6',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDefaultDailyLoads(days: number): DailyLoad[] {
  return Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    srpe: 400,
    type: 'normal' as const,
  }));
}

// ---------------------------------------------------------------------------
// Inner component (needs useSearchParams inside Suspense)
// ---------------------------------------------------------------------------

function ConditioningSimulatorInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const athleteId = searchParams.get('athleteId') ?? '';

  // ----- State -----
  const [simulationDays, setSimulationDays] = useState(7);
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([
    { name: SCENARIO_DEFAULTS[0]!, dailyLoads: createDefaultDailyLoads(7) },
  ]);
  const [results, setResults] = useState<SimulationResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<number | null>(null);

  // ----- Handlers -----

  const handleDaysChange = useCallback(
    (days: number) => {
      setSimulationDays(days);
      setScenarios((prev) =>
        prev.map((s) => {
          const existing = s.dailyLoads;
          const newLoads: DailyLoad[] = Array.from({ length: days }, (_, i) => {
            const found = existing.find((dl) => dl.day === i + 1);
            return found ?? { day: i + 1, srpe: 400, type: 'normal' as const };
          });
          return { ...s, dailyLoads: newLoads };
        }),
      );
      setResults(null);
    },
    [],
  );

  const addScenario = useCallback(() => {
    setScenarios((prev) => {
      if (prev.length >= 3) return prev;
      return [
        ...prev,
        {
          name: SCENARIO_DEFAULTS[prev.length] ?? `シナリオ${prev.length + 1}`,
          dailyLoads: createDefaultDailyLoads(simulationDays),
        },
      ];
    });
  }, [simulationDays]);

  const removeScenario = useCallback((index: number) => {
    setScenarios((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const updateScenarioName = useCallback((index: number, name: string) => {
    setScenarios((prev) =>
      prev.map((s, i) => (i === index ? { ...s, name } : s)),
    );
  }, []);

  const updateDailyLoad = useCallback(
    (scenarioIdx: number, day: number, field: 'srpe' | 'type', value: number | string) => {
      setScenarios((prev) =>
        prev.map((s, i) => {
          if (i !== scenarioIdx) return s;
          return {
            ...s,
            dailyLoads: s.dailyLoads.map((dl) => {
              if (dl.day !== day) return dl;
              if (field === 'srpe') {
                return { ...dl, srpe: Math.max(0, Math.min(1000, Number(value))) };
              }
              return { ...dl, type: value as DailyLoad['type'] };
            }),
          };
        }),
      );
    },
    [],
  );

  const applyPreset = useCallback(
    (scenarioIdx: number, preset: (typeof PRESETS)[number]) => {
      setScenarios((prev) =>
        prev.map((s, i) => {
          if (i !== scenarioIdx) return s;
          return {
            ...s,
            dailyLoads: s.dailyLoads.map((dl) => ({
              ...dl,
              srpe: preset.srpe,
              type: preset.type,
            })),
          };
        }),
      );
    },
    [],
  );

  const runSimulation = useCallback(async () => {
    if (!athleteId) {
      setError('選手IDが指定されていません。');
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch('/api/simulator/conditioning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          scenarios,
          simulationDays,
        }),
      });

      const json: SimulationResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error ?? 'シミュレーションに失敗しました。');
      } else {
        setResults(json.data);
      }
    } catch {
      setError('通信エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }, [athleteId, scenarios, simulationDays]);

  const adoptScenario = useCallback(
    async (scenarioIdx: number) => {
      if (!results || !athleteId) return;
      const scenario = results.scenarios[scenarioIdx];
      if (!scenario) return;

      setAdopting(scenarioIdx);
      try {
        const res = await fetch('/api/assessment/conditioning/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athleteId,
            selectedScenario: scenario,
            simulationParams: {
              simulationDays,
              scenarioInputs: scenarios,
            },
            status: 'draft',
          }),
        });
        const json = await res.json();
        if (json.success) {
          alert('シナリオを採用しました。');
        } else {
          alert(json.error ?? 'シナリオの保存に失敗しました。');
        }
      } catch {
        alert('通信エラーが発生しました。');
      } finally {
        setAdopting(null);
      }
    },
    [results, athleteId, simulationDays, scenarios],
  );

  // ----- Derived data for charts -----

  const acwrChartData = results
    ? Array.from({ length: simulationDays }, (_, i) => {
        const day = i + 1;
        const point: Record<string, number> = { day };
        results.scenarios.forEach((s, idx) => {
          const p = s.acwrTrend.find((ap) => ap.day === day);
          point[`scenario${idx}`] = p?.acwr ?? 0;
        });
        return point;
      })
    : [];

  const monotonyChartData = results
    ? Array.from({ length: simulationDays }, (_, i) => {
        const day = i + 1;
        const point: Record<string, number> = { day };
        results.scenarios.forEach((s, idx) => {
          const p = s.monotonyTrend.find((mp) => mp.day === day);
          point[`scenario${idx}`] = p?.monotony ?? 0;
        });
        return point;
      })
    : [];

  const recommendedIdx = results?.recommendedScenario ?? 0;
  const recommendedScenario = results?.scenarios[recommendedIdx];

  const tissueChartData =
    recommendedScenario
      ? Array.from({ length: simulationDays }, (_, i) => {
          const day = i + 1;
          const point: Record<string, number> = { day };
          for (const [category, points] of Object.entries(
            recommendedScenario.tissueRecovery,
          )) {
            const tp = points.find((p) => p.day === day);
            point[category] = tp?.value ?? 0;
          }
          return point;
        })
      : [];

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* ------- Header ------- */}
      <div>
        <button
          onClick={() =>
            athleteId
              ? router.push(`/athletes/${athleteId}`)
              : router.back()
          }
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          選手ページに戻る
        </button>
        <h1 className="text-xl font-bold tracking-tight">
          コンディショニング・シミュレータ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          負荷変更による影響を予測
        </p>
      </div>

      {/* ------- Scenario Builder ------- */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium">
            シミュレーション期間
            <select
              value={simulationDays}
              onChange={(e) => handleDaysChange(Number(e.target.value))}
              className="ml-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 3).map((d) => (
                <option key={d} value={d}>
                  {d}日間
                </option>
              ))}
            </select>
          </label>
        </div>

        {scenarios.map((scenario, sIdx) => (
          <div
            key={sIdx}
            className="rounded-lg border border-border p-4 space-y-3"
            style={{ borderLeftColor: SCENARIO_COLORS[sIdx], borderLeftWidth: 4 }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={scenario.name}
                onChange={(e) => updateScenarioName(sIdx, e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold w-40"
                maxLength={50}
              />
              {scenarios.length > 1 && (
                <button
                  onClick={() => removeScenario(sIdx)}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  削除
                </button>
              )}
              <div className="flex gap-1.5 ml-auto flex-wrap">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => applyPreset(sIdx, preset)}
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                      日
                    </th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                      sRPE
                    </th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                      種別
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scenario.dailyLoads.map((dl) => (
                    <tr key={dl.day} className="border-b border-border/50">
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">
                        Day {dl.day}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          step={50}
                          value={dl.srpe}
                          onChange={(e) =>
                            updateDailyLoad(sIdx, dl.day, 'srpe', e.target.value)
                          }
                          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={dl.type}
                          onChange={(e) =>
                            updateDailyLoad(sIdx, dl.day, 'type', e.target.value)
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                        >
                          {LOAD_TYPES.map((lt) => (
                            <option key={lt.value} value={lt.value}>
                              {lt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          {scenarios.length < 3 && (
            <button
              onClick={addScenario}
              className="rounded-md border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
            >
              + シナリオを追加
            </button>
          )}
          <button
            onClick={runSimulation}
            disabled={loading || !athleteId}
            className="ml-auto rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? '計算中...' : 'シミュレーション実行'}
          </button>
        </div>
      </section>

      {/* ------- Error ------- */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ------- Loading Skeleton ------- */}
      {loading && (
        <div className="space-y-4">
          <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
        </div>
      )}

      {/* ------- Results ------- */}
      {results && !loading && (
        <div className="space-y-6">
          {/* Recommended badge */}
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              推奨シナリオ: {results.scenarios[recommendedIdx]?.name}
            </span>
          </div>

          {/* ACWR Trajectory */}
          <section className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-3">
            <h2 className="text-base font-semibold">ACWR予測推移</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={acwrChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12 }}
                    label={{ value: '日', position: 'insideBottomRight', offset: -5, fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 'auto']}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(val: number) => val.toFixed(2)}
                  />
                  <ReferenceArea
                    y1={0.8}
                    y2={1.3}
                    fill="#059669"
                    fillOpacity={0.08}
                    label={{ value: '安全域', position: 'insideTopLeft', fontSize: 10 }}
                  />
                  <ReferenceLine
                    y={1.5}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: '過負荷', position: 'right', fontSize: 10 }}
                  />
                  {results.scenarios.map((s, idx) => (
                    <Line
                      key={s.name}
                      type="monotone"
                      dataKey={`scenario${idx}`}
                      name={s.name}
                      stroke={SCENARIO_COLORS[idx]}
                      strokeWidth={idx === recommendedIdx ? 3 : 1.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Monotony Trajectory */}
          <section className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-3">
            <h2 className="text-base font-semibold">練習の単調さ予測</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monotonyChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12 }}
                    label={{ value: '日', position: 'insideBottomRight', offset: -5, fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(val: number) => val.toFixed(2)}
                  />
                  <ReferenceLine
                    y={2.0}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: '閾値', position: 'right', fontSize: 10 }}
                  />
                  {results.scenarios.map((s, idx) => (
                    <Line
                      key={s.name}
                      type="monotone"
                      dataKey={`scenario${idx}`}
                      name={s.name}
                      stroke={SCENARIO_COLORS[idx]}
                      strokeWidth={idx === recommendedIdx ? 3 : 1.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Tissue Recovery (recommended scenario only) */}
          {recommendedScenario && (
            <section className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-3">
              <h2 className="text-base font-semibold">
                身体へのダメージ回復予測
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({recommendedScenario.name})
                </span>
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tissueChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12 }}
                      label={{ value: '日', position: 'insideBottomRight', offset: -5, fontSize: 12 }}
                    />
                    <YAxis
                      domain={[0, 1]}
                      tick={{ fontSize: 12 }}
                      label={{ value: 'ダメージ', angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(val: number, name: string) => [
                        val.toFixed(3),
                        TISSUE_LABELS[name] ?? name,
                      ]}
                    />
                    {Object.keys(TISSUE_LABELS).map((category) => (
                      <Line
                        key={category}
                        type="monotone"
                        dataKey={category}
                        name={category}
                        stroke={TISSUE_COLORS[category]}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                {Object.entries(TISSUE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: TISSUE_COLORS[key] }}
                    />
                    {label}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Decision Timeline */}
          <section className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-3">
            <h2 className="text-base font-semibold">リスク判定予測</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                      日
                    </th>
                    {results.scenarios.map((s, idx) => (
                      <th
                        key={s.name}
                        className="px-2 py-2 text-left font-medium"
                        style={{ color: SCENARIO_COLORS[idx] }}
                      >
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: simulationDays }, (_, i) => {
                    const day = i + 1;
                    return (
                      <tr key={day} className="border-b border-border/50">
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">
                          Day {day}
                        </td>
                        {results.scenarios.map((s) => {
                          const dp = s.decisions.find((d) => d.day === day);
                          const priority = dp?.priority ?? 'P5';
                          const colorClass = DECISION_COLORS[priority] ?? 'bg-gray-200';
                          return (
                            <td key={s.name} className="px-2 py-1.5">
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${colorClass}`}
                              >
                                {priority}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sweet Spot Return */}
          <section className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-3">
            <h2 className="text-base font-semibold">安全域復帰予測</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.scenarios.map((s, idx) => (
                <div
                  key={s.name}
                  className="rounded-lg border border-border p-4 space-y-2"
                  style={{ borderLeftColor: SCENARIO_COLORS[idx], borderLeftWidth: 4 }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{s.name}</span>
                    {idx === recommendedIdx && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        推奨
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {s.sweetSpotReturn !== null
                      ? `Day ${s.sweetSpotReturn} で安全域に復帰`
                      : '期間内に安全域に復帰しません'}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Scenario Adoption */}
          <section className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-3">
            <h2 className="text-base font-semibold">シナリオの採用</h2>
            <div className="flex flex-wrap gap-3">
              {results.scenarios.map((s, idx) => (
                <button
                  key={s.name}
                  onClick={() => adoptScenario(idx)}
                  disabled={adopting !== null}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
                  style={{ borderColor: SCENARIO_COLORS[idx] }}
                >
                  {adopting === idx ? (
                    '保存中...'
                  ) : (
                    <>
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: SCENARIO_COLORS[idx] }}
                      />
                      このシナリオを採用 ({s.name})
                    </>
                  )}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (wraps inner in Suspense for useSearchParams)
// ---------------------------------------------------------------------------

export default function ConditioningSimulatorPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-96 animate-pulse rounded-lg border border-border bg-card" />
        </div>
      }
    >
      <ConditioningSimulatorInner />
    </Suspense>
  );
}
