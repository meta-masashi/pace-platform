'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PhaseStepper } from './phase-stepper';
import { GateCriteriaCard } from './gate-criteria-card';
import { ExerciseMenu } from './exercise-menu';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Gate {
  id: string;
  phase: number;
  gate_criteria_json: Record<string, unknown>;
  gate_met_at: string | null;
  verified_by_staff_id: string | null;
  staff: { name: string } | null;
}

interface Lock {
  id: string;
  lock_type: string;
  tag: string;
  reason: string | null;
  set_at: string;
  expires_at: string | null;
}

interface Exercise {
  id: string;
  category: string | null;
  phase: number;
  name_en: string | null;
  name_ja: string | null;
  target_axis: string | null;
  sets: number | null;
  reps: string | null;
  time_sec: number | null;
  percent_1rm: number | null;
  rpe: number | null;
  cues: string | null;
  contraindication_tags_json: string[];
}

interface Workout {
  id: string;
  menu_json: Record<string, unknown>;
  generated_at: string;
  approved_at: string | null;
  distributed_at: string | null;
}

interface ProgramData {
  program: {
    id: string;
    athlete_id: string;
    diagnosis_code: string | null;
    current_phase: number;
    start_date: string;
    estimated_rtp_date: string | null;
    status: string;
    athletes: {
      id: string;
      name: string;
      position: string | null;
      number: number | null;
      sport: string | null;
    };
  };
  gates: Gate[];
  exercises: Exercise[];
  locks: Lock[];
  workouts: Workout[];
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * リハビリプログラム詳細コンポーネント
 *
 * フェーズタイムライン・ゲート基準・エクササイズメニュー・ロック状態を統合表示する。
 */
export function ProgramDetail({
  paramsPromise,
}: {
  paramsPromise: Promise<{ programId: string }>;
}) {
  const { programId } = use(paramsPromise);
  const [data, setData] = useState<ProgramData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rehab/programs/${programId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return null; // Suspense fallback が表示される
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        <p className="font-medium">エラーが発生しました</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const { program, gates, exercises, locks, workouts } = data;
  const athlete = program.athletes;

  /** ステータスバッジ */
  const statusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'completed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'on_hold':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'active': return '進行中';
      case 'completed': return '完了';
      case 'on_hold': return '保留';
      default: return status;
    }
  };

  /** 現在フェーズのゲート */
  const currentGate = gates.find((g) => g.phase === program.current_phase);

  return (
    <div className="space-y-6">
      {/* 戻るリンク */}
      <Link
        href="/rehab"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        リハビリ一覧に戻る
      </Link>

      {/* ヘッダー */}
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">
          {athlete?.name ?? '不明'}
          {athlete?.number != null && (
            <span className="ml-1 text-muted-foreground">#{athlete.number}</span>
          )}
        </h1>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusBadge(program.status)}`}>
          {statusLabel(program.status)}
        </span>
        {program.diagnosis_code && (
          <span className="rounded-lg bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {program.diagnosis_code}
          </span>
        )}
      </div>

      {/* ロック警告 */}
      {locks.length > 0 && (
        <div className="space-y-2">
          {locks.map((lock) => (
            <div
              key={lock.id}
              className={`flex items-center gap-3 rounded-lg border p-4 ${
                lock.lock_type === 'hard'
                  ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                  : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
              }`}
            >
              <svg
                className={`h-5 w-5 flex-shrink-0 ${
                  lock.lock_type === 'hard' ? 'text-red-500' : 'text-amber-500'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
              <div className="flex-1">
                <p className={`text-sm font-medium ${lock.lock_type === 'hard' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {lock.lock_type === 'hard' ? 'Hard Lock' : 'Soft Lock'}: {lock.tag}
                </p>
                {lock.reason && (
                  <p className={`mt-0.5 text-xs ${lock.lock_type === 'hard' ? 'text-red-600 dark:text-red-500' : 'text-amber-600 dark:text-amber-500'}`}>
                    {lock.reason}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* フェーズタイムライン */}
      <PhaseStepper
        currentPhase={program.current_phase}
        gates={gates}
        status={program.status}
      />

      {/* ゲート基準カード */}
      {program.status !== 'completed' && currentGate && (
        <GateCriteriaCard
          programId={programId}
          gate={currentGate}
          currentPhase={program.current_phase}
          onGateVerified={fetchData}
        />
      )}

      {/* エクササイズメニュー */}
      <ExerciseMenu
        programId={programId}
        currentPhase={program.current_phase}
        exercises={exercises}
        workouts={workouts}
        onMenuGenerated={fetchData}
      />
    </div>
  );
}
