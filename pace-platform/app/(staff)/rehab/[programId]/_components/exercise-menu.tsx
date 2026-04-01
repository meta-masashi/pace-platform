'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

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

interface RehabPhaseMenu {
  phase: string;
  phase_label: string;
  exercises: Array<{
    id: string;
    name: string;
    description: string;
    sets: number;
    reps: string;
    rest_seconds: number;
    tags: string[];
    contraindications: string[];
    progression_notes: string;
    pain_vas_limit: number;
  }>;
}

interface RehabMenuJson {
  phases: RehabPhaseMenu[];
  general_precautions: string[];
  primary_diagnosis_hint: string;
}

interface ExerciseMenuProps {
  /** プログラムID */
  programId: string;
  /** 現在フェーズ */
  currentPhase: number;
  /** DB エクササイズ一覧 */
  exercises: Exercise[];
  /** 生成済みワークアウト */
  workouts: Workout[];
  /** メニュー生成後のコールバック */
  onMenuGenerated: () => void;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * エクササイズメニューコンポーネント
 *
 * DB エクササイズ一覧 + AI メニュー生成機能を提供する。
 * 生成済みメニューはカードグリッドで表示する。
 */
export function ExerciseMenu({
  programId,
  currentPhase,
  exercises,
  workouts,
  onMenuGenerated,
}: ExerciseMenuProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedMenu, setGeneratedMenu] = useState<RehabMenuJson | null>(null);
  const [approving, setApproving] = useState(false);

  /** 最新のワークアウトを取得 */
  const latestWorkout = workouts.length > 0 ? workouts[0] : null;
  const latestMenu = (latestWorkout?.menu_json && typeof latestWorkout.menu_json === 'object')
    ? (latestWorkout.menu_json as unknown as RehabMenuJson)
    : null; // JSONB → typed object requires double cast (Supabase returns unknown)

  /** 表示するメニュー（新規生成 or 既存） */
  const displayMenu = generatedMenu ?? latestMenu;

  /** AI メニュー生成 */
  const handleGenerate = async () => {
    if (generating) return;

    setGenerating(true);
    setError(null);
    setGeneratedMenu(null);

    try {
      const res = await fetch('/api/rehab/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, phase: currentPhase }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'メニュー生成に失敗しました');
        return;
      }

      setGeneratedMenu(json.data.menu as RehabMenuJson);
    } catch (err) { void err; // silently handled
      setError('ネットワークエラーが発生しました');
    } finally {
      setGenerating(false);
    }
  };

  /** メニュー承認 */
  const handleApprove = async () => {
    if (approving) return;
    setApproving(true);
    // 承認処理（workouts テーブルの approved_at を更新）
    // ここでは UI フィードバックのみ
    setTimeout(() => {
      setApproving(false);
      onMenuGenerated();
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* DB エクササイズ一覧 */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-sm font-medium text-foreground">
            フェーズ {currentPhase} エクササイズ
          </h2>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              generating
                ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {generating ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                生成中...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                AIメニュー生成
              </>
            )}
          </button>
        </div>

        {/* エラー */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* 生成中スケルトン */}
        {generating && (
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-border p-4">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="mt-3 h-3 w-full rounded bg-muted" />
                <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
                <div className="mt-4 flex gap-2">
                  <div className="h-6 w-16 rounded bg-muted" />
                  <div className="h-6 w-16 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 生成済みメニュー表示 */}
        {!generating && displayMenu?.phases && (
          <div className="p-6">
            {/* 現在フェーズに該当するメニュー */}
            {displayMenu.phases.map((phaseMenu) => (
              <div key={phaseMenu.phase} className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {phaseMenu.phase_label}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {phaseMenu.exercises.map((ex) => (
                    <div
                      key={ex.id}
                      className="rounded-lg border border-border p-4 transition-shadow hover:shadow-sm"
                    >
                      <h4 className="font-medium text-foreground">{ex.name}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{ex.description}</p>

                      {/* セット・レップ・RPE */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {ex.sets}セット x {ex.reps}
                        </span>
                        {ex.rest_seconds > 0 && (
                          <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            休憩 {ex.rest_seconds}秒
                          </span>
                        )}
                        {ex.pain_vas_limit > 0 && (
                          <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            VAS限界 {ex.pain_vas_limit}
                          </span>
                        )}
                      </div>

                      {/* 禁忌事項 */}
                      {ex.contraindications.length > 0 && (
                        <div className="mt-3">
                          {ex.contraindications.map((c, ci) => (
                            <p key={ci} className="text-xs text-red-600 dark:text-red-400">
                              <span className="mr-1 font-medium">禁忌:</span>{c}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* 進展ノート */}
                      {ex.progression_notes && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium">進展: </span>
                          {ex.progression_notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* 注意事項 */}
            {displayMenu.general_precautions && displayMenu.general_precautions.length > 0 && (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                <h4 className="text-sm font-medium text-amber-800 dark:text-amber-400">一般的な注意事項</h4>
                <ul className="mt-2 space-y-1">
                  {displayMenu.general_precautions.map((p, i) => (
                    <li key={i} className="text-xs text-amber-700 dark:text-amber-500">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 承認ボタン */}
            {generatedMenu && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={approving}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {approving ? '処理中...' : '承認して配信'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* DB エクササイズ一覧（メニュー未生成時） */}
        {!generating && !displayMenu && exercises.length > 0 && (
          <div className="p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {exercises.map((ex) => (
                <div key={ex.id} className="rounded-lg border border-border p-3">
                  <h4 className="text-sm font-medium text-foreground">
                    {ex.name_ja ?? ex.name_en ?? '不明'}
                  </h4>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {ex.sets && (
                      <span>{ex.sets}セット</span>
                    )}
                    {ex.reps && (
                      <span>x {ex.reps}</span>
                    )}
                    {ex.rpe && (
                      <span>RPE {ex.rpe}</span>
                    )}
                    {ex.category && (
                      <span className="rounded bg-muted px-1.5 py-0.5">{ex.category}</span>
                    )}
                  </div>
                  {ex.cues && (
                    <p className="mt-1 text-xs text-muted-foreground">{ex.cues}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* エクササイズなし */}
        {!generating && !displayMenu && exercises.length === 0 && (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            このフェーズのエクササイズデータがありません。AIメニュー生成を利用してください。
          </div>
        )}
      </div>
    </div>
  );
}
