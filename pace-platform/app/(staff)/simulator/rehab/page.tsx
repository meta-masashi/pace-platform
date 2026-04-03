'use client';

import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Recharts dynamic imports (SSR disabled)
// ---------------------------------------------------------------------------

function NrsChartInner({
  data,
}: {
  data: Array<{ day: number; baseline: number; proposed: number }>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip: RTooltip,
    ReferenceLine,
    ResponsiveContainer,
    Legend,
  } = require('recharts');

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10 }}
          tickMargin={6}
          stroke="hsl(var(--muted-foreground))"
          opacity={0.6}
          label={{
            value: '日数',
            position: 'insideBottomRight',
            offset: -5,
            fontSize: 10,
            fill: 'hsl(var(--muted-foreground))',
          }}
        />
        <YAxis
          domain={[0, 10]}
          tick={{ fontSize: 10 }}
          tickMargin={4}
          stroke="hsl(var(--muted-foreground))"
          opacity={0.6}
        />
        <RTooltip
          content={<NrsTooltip />}
          cursor={{
            stroke: 'hsl(var(--muted-foreground))',
            strokeWidth: 1,
            opacity: 0.3,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) =>
            value === 'baseline' ? '現行プラン' : '変更後プラン'
          }
        />
        <ReferenceLine
          y={3}
          stroke="#f59e0b"
          strokeDasharray="6 3"
          strokeOpacity={0.5}
          label={{
            value: 'NRS 3 基準',
            position: 'insideTopRight',
            fontSize: 10,
            fill: '#f59e0b',
          }}
        />
        <Line
          type="monotone"
          dataKey="baseline"
          stroke="#9ca3af"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="proposed"
          stroke="#00F2FF"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

const DynamicNrsChart = dynamic(() => Promise.resolve(NrsChartInner), {
  ssr: false,
});

function TissueLoadChartInner({
  data,
}: {
  data: Array<{
    tissue: string;
    currentLoad: number;
    proposedLoad: number;
    ceiling: number;
  }>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip: RTooltip,
    ReferenceLine,
    ResponsiveContainer,
    Legend,
  } = require('recharts');

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis
          type="number"
          domain={[0, 0.5]}
          tick={{ fontSize: 10 }}
          stroke="hsl(var(--muted-foreground))"
          opacity={0.6}
        />
        <YAxis
          type="category"
          dataKey="tissue"
          tick={{ fontSize: 10 }}
          stroke="hsl(var(--muted-foreground))"
          opacity={0.6}
          width={55}
        />
        <RTooltip
          content={<TissueTooltip />}
          cursor={{
            fill: 'hsl(var(--muted-foreground))',
            opacity: 0.05,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) =>
            value === 'currentLoad' ? '現在負荷' : '変更後負荷'
          }
        />
        <ReferenceLine
          x={0.3}
          stroke="#FF4B4B"
          strokeDasharray="4 4"
          strokeWidth={2}
          label={{
            value: '上限 0.3',
            position: 'insideTopRight',
            fontSize: 10,
            fill: '#FF4B4B',
          }}
        />
        <Bar dataKey="currentLoad" fill="#9ca3af" barSize={10} radius={[0, 2, 2, 0]} />
        <Bar dataKey="proposedLoad" fill="#00F2FF" barSize={10} radius={[0, 2, 2, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const DynamicTissueLoadChart = dynamic(
  () => Promise.resolve(TissueLoadChartInner),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------

function NrsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const baseline = payload.find((p) => p.dataKey === 'baseline');
  const proposed = payload.find((p) => p.dataKey === 'proposed');
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {label}日目
      </p>
      {baseline && (
        <p className="text-xs">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />{' '}
          <span className="text-muted-foreground">現行: </span>
          <span className="font-bold tabular-nums">{baseline.value.toFixed(1)}</span>
        </p>
      )}
      {proposed && (
        <p className="text-xs">
          <span className="inline-block h-2 w-2 rounded-full bg-cyber-cyan-500" />{' '}
          <span className="text-muted-foreground">変更後: </span>
          <span className="font-bold tabular-nums">{proposed.value.toFixed(1)}</span>
        </p>
      )}
    </div>
  );
}

function TissueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const current = payload.find((p) => p.dataKey === 'currentLoad');
  const proposed = payload.find((p) => p.dataKey === 'proposedLoad');
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {current && (
        <p className="text-xs">
          <span className="text-muted-foreground">現在: </span>
          <span className="font-bold tabular-nums">{current.value.toFixed(3)}</span>
        </p>
      )}
      {proposed && (
        <p className="text-xs">
          <span className="text-muted-foreground">変更後: </span>
          <span className="font-bold tabular-nums">{proposed.value.toFixed(3)}</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RehabExercise {
  id: string;
  name: string;
  category: string;
  intensity: string;
  min_phase: number;
  contraindications: string[];
}

interface Prescription {
  id: string;
  exercise_id: string;
  exercise_name: string;
  sets: number;
  reps: number;
  category: string;
  intensity: string;
}

interface PendingChange {
  type: 'add' | 'remove' | 'modify';
  exerciseId: string;
  exerciseName: string;
  sets?: number;
  reps?: number;
}

interface TissueLoad {
  tissue: string;
  currentLoad: number;
  proposedLoad: number;
  ceiling: number;
  safe: boolean;
}

interface PhaseCriterion {
  name: string;
  currentProgress: number;
  target: number;
  estimatedDays: number;
}

interface SimulationResult {
  tissueLoads: TissueLoad[];
  nrsForecast: Array<{ day: number; baseline: number; proposed: number }>;
  phaseCriteria: PhaseCriterion[];
  returnTimeline: {
    currentDays: number;
    modifiedDays: number;
    difference: number;
  };
  riskAssessment: {
    level: 'low' | 'moderate' | 'high';
    warnings: string[];
  };
  safetyViolations: string[];
}

interface RehabState {
  currentPhase: number;
  daysSinceInjury: number;
  currentNRS: number;
  prescriptions: Prescription[];
}

// ---------------------------------------------------------------------------
// Category / Intensity labels
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'OKC', label: 'OKC' },
  { value: 'CKC', label: 'CKC' },
  { value: 'balance', label: 'バランス' },
  { value: 'agility', label: 'アジリティ' },
  { value: 'sport_specific', label: '競技特異的' },
];

const INTENSITY_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const RISK_BADGE: Record<string, { label: string; className: string }> = {
  low: { label: '低リスク', className: 'bg-brand-100 text-brand-700 border-brand-200' },
  moderate: {
    label: '中リスク',
    className: 'bg-amber-caution-100 text-amber-caution-700 border-amber-caution-200',
  },
  high: {
    label: '高リスク',
    className: 'bg-pulse-red-100 text-pulse-red-700 border-pulse-red-200',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RehabSimulatorPage() {
  const searchParams = useSearchParams();
  const athleteId = searchParams.get('athleteId') ?? '';
  const programId = searchParams.get('programId') ?? '';

  // ----- State -----
  const [rehabState, setRehabState] = useState<RehabState | null>(null);
  const [exerciseMaster, setExerciseMaster] = useState<RehabExercise[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [forecastDays, setForecastDays] = useState(30);
  const [results, setResults] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Exercise add form state
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterIntensity, setFilterIntensity] = useState('');
  const [addSets, setAddSets] = useState(3);
  const [addReps, setAddReps] = useState(10);

  // ----- Fetch rehab state & exercise master -----
  useEffect(() => {
    if (!athleteId) {
      setLoadingState(false);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      setLoadingState(true);
      try {
        const [stateRes, exerciseRes] = await Promise.all([
          fetch(`/api/assessment/rehab/${encodeURIComponent(athleteId)}`),
          fetch('/api/rehab/exercises'),
        ]);

        if (!cancelled) {
          if (stateRes.ok) {
            const stateJson = await stateRes.json();
            if (stateJson.success && stateJson.data) {
              setRehabState({
                currentPhase: stateJson.data.currentPhase ?? 1,
                daysSinceInjury: stateJson.data.daysSinceInjury ?? 0,
                currentNRS: stateJson.data.currentNRS ?? 0,
                prescriptions: stateJson.data.prescriptions ?? [],
              });
            }
          }

          if (exerciseRes.ok) {
            const exerciseJson = await exerciseRes.json();
            if (exerciseJson.success && exerciseJson.data) {
              setExerciseMaster(exerciseJson.data);
            } else if (Array.isArray(exerciseJson)) {
              setExerciseMaster(exerciseJson);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setError('データの取得に失敗しました');
        }
      } finally {
        if (!cancelled) setLoadingState(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  // ----- Filtered exercises for dropdown -----
  const filteredExercises = exerciseMaster.filter((ex) => {
    if (rehabState && ex.min_phase > rehabState.currentPhase) return false;
    if (filterCategory && ex.category !== filterCategory) return false;
    if (filterIntensity && ex.intensity !== filterIntensity) return false;
    return true;
  });

  // ----- Add exercise -----
  const handleAddExercise = useCallback(() => {
    if (!selectedExerciseId) return;
    const exercise = exerciseMaster.find((e) => e.id === selectedExerciseId);
    if (!exercise) return;

    // Prevent duplicates
    if (pendingChanges.some((c) => c.type === 'add' && c.exerciseId === selectedExerciseId)) {
      return;
    }

    setPendingChanges((prev) => [
      ...prev,
      {
        type: 'add',
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: addSets,
        reps: addReps,
      },
    ]);
    setSelectedExerciseId('');
  }, [selectedExerciseId, exerciseMaster, pendingChanges, addSets, addReps]);

  // ----- Remove prescription -----
  const handleRemovePrescription = useCallback(
    (prescription: Prescription) => {
      // Prevent duplicates
      if (
        pendingChanges.some(
          (c) => c.type === 'remove' && c.exerciseId === prescription.exercise_id,
        )
      ) {
        return;
      }
      setPendingChanges((prev) => [
        ...prev,
        {
          type: 'remove',
          exerciseId: prescription.exercise_id,
          exerciseName: prescription.exercise_name,
        },
      ]);
    },
    [pendingChanges],
  );

  // ----- Remove pending change -----
  const handleRemoveChange = useCallback((index: number) => {
    setPendingChanges((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ----- Run simulation -----
  const runSimulation = useCallback(async () => {
    if (!athleteId) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch('/api/simulator/rehab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          programId: programId || undefined,
          changes: pendingChanges,
          forecastDays,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? 'シミュレーションに失敗しました');
        return;
      }

      setResults(json.data);
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [athleteId, programId, pendingChanges, forecastDays]);

  // ----- Apply changes -----
  const applyChanges = useCallback(async () => {
    if (!athleteId || pendingChanges.length === 0) return;

    setApplying(true);
    try {
      const res = await fetch('/api/simulator/rehab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          programId: programId || undefined,
          changes: pendingChanges,
          forecastDays,
          apply: true,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setPendingChanges([]);
        setResults(null);
        // Refetch rehab state
        const stateRes = await fetch(
          `/api/assessment/rehab/${encodeURIComponent(athleteId)}`,
        );
        if (stateRes.ok) {
          const stateJson = await stateRes.json();
          if (stateJson.success && stateJson.data) {
            setRehabState({
              currentPhase: stateJson.data.currentPhase ?? 1,
              daysSinceInjury: stateJson.data.daysSinceInjury ?? 0,
              currentNRS: stateJson.data.currentNRS ?? 0,
              prescriptions: stateJson.data.prescriptions ?? [],
            });
          }
        }
      } else {
        setError(json.error ?? '変更の適用に失敗しました');
      }
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setApplying(false);
    }
  }, [athleteId, programId, pendingChanges, forecastDays]);

  // ----- Loading state -----
  if (loadingState) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    );
  }

  // ----- No athlete -----
  if (!athleteId) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Header athleteId="" />
        <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-border bg-card">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-muted-foreground/30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <circle cx="12" cy="12" r="10" />
              <path d="M12 17h.01" />
            </svg>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              選手IDが指定されていません
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              URLパラメータに athleteId を指定してください
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ============================================================ */}
      {/* 1. Header */}
      {/* ============================================================ */}
      <Header athleteId={athleteId} />

      {/* ============================================================ */}
      {/* 2. Current State Panel */}
      {/* ============================================================ */}
      {rehabState && <CurrentStatePanel state={rehabState} />}

      {/* ============================================================ */}
      {/* 3. Exercise Change Builder */}
      {/* ============================================================ */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          種目変更ビルダー
        </h2>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Current prescriptions */}
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              現在の処方
            </h3>
            {rehabState?.prescriptions && rehabState.prescriptions.length > 0 ? (
              <div className="space-y-2">
                {rehabState.prescriptions.map((rx) => {
                  const isRemoved = pendingChanges.some(
                    (c) =>
                      c.type === 'remove' && c.exerciseId === rx.exercise_id,
                  );
                  return (
                    <div
                      key={rx.id}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                        isRemoved
                          ? 'border-pulse-red-200 bg-pulse-red-50 opacity-60 line-through'
                          : 'border-border bg-background'
                      }`}
                    >
                      <div>
                        <span className="font-medium">{rx.exercise_name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {rx.sets}x{rx.reps}
                        </span>
                        <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {rx.category}
                        </span>
                      </div>
                      {!isRemoved && (
                        <button
                          type="button"
                          onClick={() => handleRemovePrescription(rx)}
                          className="rounded px-2 py-1 text-xs font-medium text-pulse-red-500 transition-colors hover:bg-pulse-red-50"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground">
                  現在の処方はありません
                </p>
              </div>
            )}
          </div>

          {/* Right: Add exercise */}
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              種目追加
            </h3>

            {/* Filters */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">
                  カテゴリ
                </label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">
                  強度
                </label>
                <select
                  value={filterIntensity}
                  onChange={(e) => setFilterIntensity(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {INTENSITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Exercise selector */}
            <div className="mb-3">
              <label className="mb-1 block text-[10px] text-muted-foreground">
                種目
              </label>
              <select
                value={selectedExerciseId}
                onChange={(e) => setSelectedExerciseId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">種目を選択</option>
                {filteredExercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} ({ex.category} / {ex.intensity})
                  </option>
                ))}
              </select>
            </div>

            {/* Sets / Reps */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">
                  セット数
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={addSets}
                  onChange={(e) => setAddSets(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">
                  レップ数
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={addReps}
                  onChange={(e) => setAddReps(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Add button */}
            <button
              type="button"
              onClick={handleAddExercise}
              disabled={!selectedExerciseId}
              className="w-full rounded-md bg-cyber-cyan-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-cyber-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              追加
            </button>
          </div>
        </div>

        {/* Changes summary */}
        {pendingChanges.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              変更サマリ ({pendingChanges.length}件)
            </h3>
            <div className="space-y-1.5">
              {pendingChanges.map((change, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        change.type === 'add'
                          ? 'bg-brand-100 text-brand-700'
                          : change.type === 'remove'
                            ? 'bg-pulse-red-100 text-pulse-red-700'
                            : 'bg-amber-caution-100 text-amber-caution-700'
                      }`}
                    >
                      {change.type === 'add'
                        ? '追加'
                        : change.type === 'remove'
                          ? '削除'
                          : '変更'}
                    </span>
                    <span className="font-medium">{change.exerciseName}</span>
                    {change.sets && change.reps && (
                      <span className="text-muted-foreground">
                        {change.sets}x{change.reps}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveChange(idx)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Forecast period & Run button */}
        <div className="mt-5 flex flex-wrap items-end gap-4 border-t border-border pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              予測期間 (日)
            </label>
            <input
              type="number"
              min={7}
              max={60}
              value={forecastDays}
              onChange={(e) => setForecastDays(Number(e.target.value))}
              className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="button"
            onClick={runSimulation}
            disabled={loading || pendingChanges.length === 0}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-20"
                />
                <path
                  d="M12 2a10 10 0 0 1 10 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            )}
            シミュレーション実行
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Error */}
      {/* ============================================================ */}
      {error && (
        <div className="rounded-lg border border-critical-200 bg-critical-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-critical-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-critical-700">{error}</p>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. Results */}
      {/* ============================================================ */}
      {results && (
        <div className="space-y-5">
          {/* 4a. Tissue Load Analysis */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              組織負荷分析
            </h3>
            <div className="h-64">
              <DynamicTissueLoadChart data={results.tissueLoads} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {results.tissueLoads.map((tl) => (
                <span
                  key={tl.tissue}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    tl.safe
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-pulse-red-200 bg-pulse-red-50 text-pulse-red-700'
                  }`}
                >
                  {tl.tissue}: {tl.safe ? '安全' : '超過注意'}
                </span>
              ))}
            </div>
          </div>

          {/* 4b. NRS Forecast */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              回復予測 (NRS)
            </h3>
            <div className="h-64">
              <DynamicNrsChart data={results.nrsForecast} />
            </div>
          </div>

          {/* 4c. Phase Transition Forecast */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              復帰基準達成予測
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">基準</th>
                    <th className="pb-2 pr-4 font-medium">現在の達成度</th>
                    <th className="pb-2 pr-4 font-medium">目標</th>
                    <th className="pb-2 font-medium">推定残日数</th>
                  </tr>
                </thead>
                <tbody>
                  {results.phaseCriteria.map((criterion) => (
                    <tr
                      key={criterion.name}
                      className="border-b border-border/50"
                    >
                      <td className="py-2.5 pr-4 font-medium">
                        {criterion.name}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-cyber-cyan-500 transition-all"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (criterion.currentProgress / criterion.target) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {Math.round(
                              (criterion.currentProgress / criterion.target) * 100,
                            )}
                            %
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-xs text-muted-foreground">
                        {criterion.target}
                      </td>
                      <td className="py-2.5 tabular-nums text-xs font-semibold">
                        {criterion.estimatedDays}日
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4d. Return Timeline Comparison */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              復帰タイムライン比較
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-background p-4 text-center">
                <p className="text-xs text-muted-foreground">現行プラン</p>
                <p className="mt-1 font-label text-kpi-md font-bold tabular-nums text-foreground">
                  {results.returnTimeline.currentDays}
                </p>
                <p className="text-xs text-muted-foreground">日</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4 text-center">
                <p className="text-xs text-muted-foreground">変更後プラン</p>
                <p className="mt-1 font-label text-kpi-md font-bold tabular-nums text-cyber-cyan-500">
                  {results.returnTimeline.modifiedDays}
                </p>
                <p className="text-xs text-muted-foreground">日</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4 text-center">
                <p className="text-xs text-muted-foreground">差分</p>
                <p
                  className={`mt-1 font-label text-kpi-md font-bold tabular-nums ${
                    results.returnTimeline.difference < 0
                      ? 'text-brand-500'
                      : results.returnTimeline.difference > 0
                        ? 'text-pulse-red-500'
                        : 'text-foreground'
                  }`}
                >
                  {results.returnTimeline.difference > 0 ? '+' : ''}
                  {results.returnTimeline.difference}
                </p>
                <p className="text-xs text-muted-foreground">
                  {results.returnTimeline.difference < 0
                    ? '日短縮'
                    : results.returnTimeline.difference > 0
                      ? '日延長'
                      : '日（変化なし）'}
                </p>
              </div>
            </div>

            {/* Visual timeline bar */}
            <div className="mt-4 space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>現行プラン</span>
                  <span>{results.returnTimeline.currentDays}日</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gray-400 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (results.returnTimeline.currentDays /
                          Math.max(
                            results.returnTimeline.currentDays,
                            results.returnTimeline.modifiedDays,
                          )) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>変更後プラン</span>
                  <span>{results.returnTimeline.modifiedDays}日</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-cyber-cyan-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (results.returnTimeline.modifiedDays /
                          Math.max(
                            results.returnTimeline.currentDays,
                            results.returnTimeline.modifiedDays,
                          )) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4e. Risk Assessment */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              リスク評価
            </h3>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                  RISK_BADGE[results.riskAssessment.level]?.className ?? ''
                }`}
              >
                {RISK_BADGE[results.riskAssessment.level]?.label ??
                  results.riskAssessment.level}
              </span>
            </div>
            {results.riskAssessment.warnings.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {results.riskAssessment.warnings.map((warning, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-xs text-amber-caution-600"
                  >
                    <svg
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 4f. Safety Violations */}
          {results.safetyViolations.length > 0 && (
            <div className="rounded-lg border-2 border-pulse-red-300 bg-pulse-red-50 p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-pulse-red-700">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                安全性チェック -- 違反あり
              </h3>
              <ul className="space-y-2">
                {results.safetyViolations.map((violation, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-md border border-pulse-red-200 bg-white px-3 py-2 text-xs font-medium text-pulse-red-700"
                  >
                    <svg
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pulse-red-500"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path
                        d="M15 9l-6 6M9 9l6 6"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    {violation}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ============================================================ */}
          {/* 5. Apply Changes */}
          {/* ============================================================ */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-primary">
                  シミュレーション結果を確認しましたか？
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  この変更を適用すると、リハビリプログラムの処方が更新されます
                </p>
              </div>
              <button
                type="button"
                onClick={applyChanges}
                disabled={
                  applying ||
                  results.safetyViolations.length > 0 ||
                  pendingChanges.length === 0
                }
                className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applying && (
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="opacity-20"
                    />
                    <path
                      d="M12 2a10 10 0 0 1 10 10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                この変更を適用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({ athleteId }: { athleteId: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          リハビリ・シミュレータ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          種目変更による復帰タイムライン予測
        </p>
      </div>
      {athleteId && (
        <Link
          href={`/athletes/${athleteId}`}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          選手ページに戻る
        </Link>
      )}
    </div>
  );
}

function CurrentStatePanel({ state }: { state: RehabState }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">現在のフェーズ</p>
        <p className="mt-1 font-label text-kpi-md font-bold tabular-nums text-foreground">
          {state.currentPhase}
          <span className="text-sm font-normal text-muted-foreground">
            /4
          </span>
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">受傷からの日数</p>
        <p className="mt-1 font-label text-kpi-md font-bold tabular-nums text-foreground">
          {state.daysSinceInjury}
          <span className="text-sm font-normal text-muted-foreground">
            日
          </span>
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">現在のNRS</p>
        <p
          className={`mt-1 font-label text-kpi-md font-bold tabular-nums ${
            state.currentNRS <= 3
              ? 'text-brand-500'
              : state.currentNRS <= 6
                ? 'text-amber-caution-500'
                : 'text-pulse-red-500'
          }`}
        >
          {state.currentNRS}
          <span className="text-sm font-normal text-muted-foreground">
            /10
          </span>
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">処方種目数</p>
        <p className="mt-1 font-label text-kpi-md font-bold tabular-nums text-foreground">
          {state.prescriptions.length}
          <span className="text-sm font-normal text-muted-foreground">
            種目
          </span>
        </p>
      </div>
    </div>
  );
}
