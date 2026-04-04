'use client';

/**
 * リハビリアセスメントタブ
 *
 * - 復帰進捗ヘッダー（フェーズ・日数・回復スコア・NRS改善率）
 * - NRS推移チャート
 * - 復帰基準チェックリスト
 * - Phase Gates タイムライン
 * - 現在のリハビリ処方一覧
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RehabAthlete {
  id: string;
  name: string;
  sport: string;
  position: string | null;
  number: number | null;
}

interface NrsTrendPoint {
  date: string;
  nrs: number;
}

interface Criterion {
  name: string;
  description: string;
  met: boolean;
  currentValue: any;
  targetValue: any;
}

interface PhaseGate {
  phase: number;
  met: boolean;
  checkedAt: string | null;
}

interface RehabExercise {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  targetTissue: string;
  intensityLevel: string;
  tissueLoad: string;
  expectedEffect: string;
}

interface Prescription {
  id: string;
  exercise: RehabExercise | null;
  startDay: number;
  endDay: number;
  sets: number;
  reps: number;
  durationSec: number;
  notes: string;
  isActive: boolean;
}

interface RehabProgram {
  programId: string;
  diagnosis: string;
  injuryDate: string;
  currentPhase: number;
  daysSinceInjury: number;
  status: string;
  recoveryScore: number;
  nrsImprovement: number;
  nrsTrend: NrsTrendPoint[];
  criteria: Criterion[];
  achievementRate: number;
  phaseGates: PhaseGate[];
  prescriptions: Prescription[];
}

interface RehabAssessmentData {
  athlete: RehabAthlete;
  hasActiveProgram: boolean;
  programs: RehabProgram[];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 回復スコア ゲージ（SVG リング） */
function RecoveryGauge({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score, 0), 100);
  const offset = circumference - (pct / 100) * circumference;

  const color =
    score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const label =
    score >= 70 ? '順調' : score >= 40 ? '経過観察' : '要注意';

  return (
    <div className="flex flex-col items-center">
      <svg width={128} height={128} className="-rotate-90">
        <circle
          cx={64}
          cy={64}
          r={radius}
          fill="none"
          stroke="hsl(160 15% 90%)"
          strokeWidth={10}
        />
        <circle
          cx={64}
          cy={64}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="-mt-[88px] flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums text-foreground">
          {score}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/** フェーズステップインジケーター */
function PhaseStepIndicator({ currentPhase }: { currentPhase: number }) {
  const phases = [1, 2, 3, 4];

  return (
    <div className="flex items-center gap-0">
      {phases.map((phase, i) => {
        const isCompleted = phase < currentPhase;
        const isCurrent = phase === currentPhase;
        const isFuture = phase > currentPhase;

        return (
          <div key={phase} className="flex items-center">
            {/* Dot */}
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                isCompleted
                  ? 'bg-optimal-500 text-white'
                  : isCurrent
                    ? 'bg-cyber-cyan-500 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {isCompleted ? '✓' : phase}
            </div>
            {/* Connecting line */}
            {i < phases.length - 1 && (
              <div
                className={`h-0.5 w-8 ${
                  phase < currentPhase ? 'bg-optimal-500' : 'bg-muted'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** NRS チャートカスタムTooltip */
function NrsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-muted-foreground">
        NRS:{' '}
        <span className="font-bold tabular-nums text-foreground">
          {payload[0].value.toFixed(1)}
        </span>
      </p>
    </div>
  );
}

/** 基準進捗バー */
function CriteriaProgressBar({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  const pct = Math.min(Math.max((current / target) * 100, 0), 100);
  const color =
    pct >= 100 ? 'bg-optimal-500' : pct >= 60 ? 'bg-watchlist-500' : 'bg-critical-500';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-2xs tabular-nums text-muted-foreground">
        {typeof current === 'number' ? current : '—'} / {typeof target === 'number' ? target : '—'}
      </span>
    </div>
  );
}

/** 強度レベルバッジ */
function IntensityBadge({ level }: { level: string }) {
  const config: Record<string, string> = {
    low: 'bg-optimal-500/10 text-optimal-500 border-optimal-500/30',
    medium: 'bg-watchlist-500/10 text-watchlist-500 border-watchlist-500/30',
    high: 'bg-critical-500/10 text-critical-500 border-critical-500/30',
  };
  const cls = config[level.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-2xs font-medium ${cls}`}>
      {level}
    </span>
  );
}

/** カテゴリバッジ */
function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex rounded-full border border-cyber-cyan-500/30 bg-cyber-cyan-500/10 px-2 py-0.5 text-2xs font-medium text-cyber-cyan-500">
      {category}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Program Section
// ---------------------------------------------------------------------------

function ProgramSection({ program }: { program: RehabProgram }) {
  const nrsChartData = program.nrsTrend.map((d) => ({
    date: d.date.slice(5),
    nrs: d.nrs,
  }));

  const activePrescriptions = program.prescriptions.filter((p) => p.isActive);
  const futurePrescriptions = program.prescriptions.filter((p) => !p.isActive);

  return (
    <div className="space-y-4">
      {/* ---- Recovery Progress Header ---- */}
      <div className="grid gap-4 sm:grid-cols-4">
        {/* Phase indicator */}
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            リハビリフェーズ
          </p>
          <PhaseStepIndicator currentPhase={program.currentPhase} />
          <p className="mt-2 text-sm font-medium text-foreground">
            Phase {program.currentPhase}
          </p>
        </div>

        {/* Day count */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">受傷からの日数</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            Day {program.daysSinceInjury}
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            診断: {program.diagnosis}
          </p>
        </div>

        {/* Recovery score gauge */}
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            回復スコア
          </p>
          <RecoveryGauge score={program.recoveryScore} />
        </div>

        {/* NRS improvement */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">痛みの改善度</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              program.nrsImprovement >= 50
                ? 'text-optimal-500'
                : program.nrsImprovement >= 20
                  ? 'text-watchlist-500'
                  : 'text-critical-500'
            }`}
          >
            {program.nrsImprovement}%
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              改善
            </span>
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            ステータス: {program.status}
          </p>
        </div>
      </div>

      {/* ---- NRS推移チャート ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          NRS推移チャート
        </h4>
        {nrsChartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={nrsChartData}
              margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(160 15% 90%)"
                vertical={false}
              />
              <ReferenceLine
                y={3}
                stroke="#10b981"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: '目標ライン',
                  position: 'insideTopRight',
                  fill: '#059669',
                  fontSize: 10,
                }}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 10]}
                tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                tickLine={false}
                axisLine={false}
                width={30}
              />
              <Tooltip content={<NrsTooltip />} />
              <Line
                type="monotone"
                dataKey="nrs"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ r: 2, fill: '#06b6d4' }}
                activeDot={{ r: 5, fill: '#06b6d4' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            データ不足
          </div>
        )}
      </div>

      {/* ---- 復帰基準チェックリスト ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            復帰基準チェックリスト
          </h4>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${
              program.achievementRate >= 80
                ? 'border-optimal-500/30 bg-optimal-500/10 text-optimal-500'
                : program.achievementRate >= 50
                  ? 'border-watchlist-500/30 bg-watchlist-500/10 text-watchlist-500'
                  : 'border-critical-500/30 bg-critical-500/10 text-critical-500'
            }`}
          >
            {program.achievementRate}% 達成
          </span>
        </div>

        {program.criteria.length > 0 ? (
          <div className="space-y-3">
            {program.criteria.map((c, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${
                  c.met
                    ? 'border-optimal-500/20 bg-optimal-500/5'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${
                      c.met
                        ? 'bg-optimal-500 text-white'
                        : 'border border-border bg-muted'
                    }`}
                  >
                    {c.met && (
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${
                        c.met ? 'text-optimal-500' : 'text-foreground'
                      }`}
                    >
                      {c.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.description}
                    </p>
                    {c.currentValue != null && c.targetValue != null && (
                      <div className="mt-2">
                        <CriteriaProgressBar
                          current={Number(c.currentValue)}
                          target={Number(c.targetValue)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            基準データなし
          </div>
        )}
      </div>

      {/* ---- Phase Gates Timeline ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Phase Gates タイムライン
        </h4>
        <div className="flex items-start justify-between">
          {program.phaseGates.map((gate, i) => (
            <div key={gate.phase} className="flex flex-1 flex-col items-center">
              <div className="flex items-center w-full">
                {/* Left connector */}
                {i > 0 && (
                  <div
                    className={`h-0.5 flex-1 ${
                      program.phaseGates[i - 1]?.met
                        ? 'bg-optimal-500'
                        : 'bg-muted'
                    }`}
                  />
                )}
                {/* Gate node */}
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                    gate.met
                      ? 'bg-optimal-500 text-white'
                      : 'border-2 border-muted bg-card text-muted-foreground'
                  }`}
                >
                  {gate.met ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <span className="text-sm font-bold">{gate.phase}</span>
                  )}
                </div>
                {/* Right connector */}
                {i < program.phaseGates.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 ${
                      gate.met ? 'bg-optimal-500' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
              <p className="mt-2 text-xs font-medium text-foreground">
                Phase {gate.phase}
              </p>
              {gate.met && gate.checkedAt && (
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  {gate.checkedAt.slice(0, 10)}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ---- 現在のリハビリ処方 ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          現在のリハビリ処方
        </h4>
        {program.prescriptions.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Active prescriptions first, then future */}
            {[...activePrescriptions, ...futurePrescriptions].map((rx) => (
              <div
                key={rx.id}
                className={`rounded-lg border p-4 transition-opacity ${
                  rx.isActive
                    ? 'border-cyber-cyan-500/30 bg-cyber-cyan-500/5'
                    : 'border-border bg-card opacity-50'
                }`}
              >
                {/* Exercise name & active indicator */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {rx.exercise?.name ?? '未設定'}
                  </p>
                  {rx.isActive && (
                    <span className="flex-shrink-0 rounded-full bg-cyber-cyan-500 px-2 py-0.5 text-2xs font-bold text-white">
                      実施中
                    </span>
                  )}
                </div>

                {/* Badges */}
                {rx.exercise && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <CategoryBadge category={rx.exercise.category} />
                    <IntensityBadge level={rx.exercise.intensityLevel} />
                  </div>
                )}

                {/* Sets × Reps / Duration */}
                <div className="mt-3 text-xs text-muted-foreground">
                  {rx.sets > 0 && rx.reps > 0 && (
                    <p>
                      <span className="font-medium tabular-nums text-foreground">
                        {rx.sets} × {rx.reps}
                      </span>
                    </p>
                  )}
                  {rx.durationSec > 0 && (
                    <p>
                      時間:{' '}
                      <span className="font-medium tabular-nums text-foreground">
                        {rx.durationSec >= 60
                          ? `${Math.floor(rx.durationSec / 60)}分${rx.durationSec % 60 > 0 ? `${rx.durationSec % 60}秒` : ''}`
                          : `${rx.durationSec}秒`}
                      </span>
                    </p>
                  )}
                </div>

                {/* Target tissue */}
                {rx.exercise?.targetTissue && (
                  <p className="mt-1 text-2xs text-muted-foreground">
                    対象組織: {rx.exercise.targetTissue}
                  </p>
                )}

                {/* Day range */}
                <p className="mt-1 text-2xs text-muted-foreground">
                  Day {rx.startDay}〜{rx.endDay}
                </p>

                {/* Notes */}
                {rx.notes && (
                  <p className="mt-2 text-2xs italic text-muted-foreground">
                    {rx.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            処方データなし
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface RehabAssessmentTabProps {
  athleteId: string;
}

export function RehabAssessmentTab({ athleteId }: RehabAssessmentTabProps) {
  const [data, setData] = useState<RehabAssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/assessment/rehab/${athleteId}`);
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
          setError(
            err instanceof Error ? err.message : 'データの取得に失敗しました',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-critical-500/20 bg-critical-500/5 p-6 text-center">
        <p className="text-sm text-critical-500">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  // No active program
  if (!data.hasActiveProgram || data.programs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          アクティブなリハビリプログラムはありません
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {data.programs.map((program) => (
        <div key={program.programId}>
          {data.programs.length > 1 && (
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              {program.diagnosis}（{program.injuryDate}）
            </h3>
          )}
          <ProgramSection program={program} />

          {/* シミュレータへのリンク */}
          <div className="mt-4 rounded-lg border border-border bg-card p-5">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              リハビリ・シミュレーション
            </h4>
            <p className="mb-3 text-xs text-muted-foreground">
              種目の追加・変更による復帰タイムラインへの影響を予測します
            </p>
            <Link
              href={`/simulator/rehab?athleteId=${athleteId}&programId=${program.programId}`}
              className="inline-flex rounded-md bg-cyber-cyan-500/20 px-4 py-2 text-sm font-medium text-cyber-cyan-500 transition-colors hover:bg-cyber-cyan-500/30"
            >
              リハビリ・シミュレータを開く
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
