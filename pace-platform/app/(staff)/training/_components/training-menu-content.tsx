'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { MenuCard } from './menu-card';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Team {
  id: string;
  name: string;
}

interface TrainingExercise {
  name: string;
  sets: number;
  reps: string;
  load_note: string;
  contraindication_tags?: string[];
}

interface TrainingSession {
  day: string;
  session_type: string;
  intensity: string;
  duration_minutes: number;
  exercises: TrainingExercise[];
  coaching_notes: string;
}

interface IndividualAdjustment {
  athlete_id: string;
  athlete_name: string;
  reason: string;
  modifications: string[];
  excluded_exercises: string[];
}

interface TrainingMenu {
  id: string;
  team_id: string;
  week_start_date: string;
  status: 'draft' | 'approved' | 'distributed';
  team_sessions: TrainingSession[];
  individual_adjustments: IndividualAdjustment[];
  locked_athletes_notice: string[];
  weekly_load_note: string;
  generated_at: string;
  approved_at: string | null;
  distributed_at: string | null;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  strength: '筋力',
  power: 'パワー',
  endurance: '持久力',
  recovery: 'リカバリー',
  speed: 'スピード',
  rest: '休息',
};

const INTENSITY_LABELS: Record<string, string> = {
  low: '低',
  moderate: '中',
  high: '高',
};

const DAY_LABELS: Record<string, string> = {
  Monday: '月曜日',
  Tuesday: '火曜日',
  Wednesday: '水曜日',
  Thursday: '木曜日',
  Friday: '金曜日',
  Saturday: '土曜日',
  Sunday: '日曜日',
};

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function getWeekStart(offset: number = 0): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0] ?? '';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function TrainingMenuContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState(
    searchParams.get('team') ?? '',
  );
  const [weekOffset, setWeekOffset] = useState(0);

  const [menu, setMenu] = useState<TrainingMenu | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStart = getWeekStart(weekOffset);

  // チーム一覧取得
  useEffect(() => {
    async function fetchTeams() {
      try {
        const res = await fetch('/api/team/list');
        if (res.ok) {
          const data = await res.json();
          setTeams(data.teams ?? []);
          if (!selectedTeamId && data.teams?.length > 0) {
            setSelectedTeamId(data.teams[0].id);
          }
        }
      } catch {
        // silent
      } finally {
        setTeamsLoading(false);
      }
    }
    fetchTeams();
    // eslint-disable-next-line -- initial fetch only
  }, []);

  // メニュー取得
  const fetchMenu = useCallback(async () => {
    if (!selectedTeamId) return;
    setMenuLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/training/menu?teamId=${selectedTeamId}&weekStart=${weekStart}`,
      );
      if (res.ok) {
        const data = await res.json();
        setMenu(data.menu ?? null);
      } else if (res.status === 404) {
        setMenu(null);
      } else {
        const data = await res.json();
        setError(data.error ?? 'メニューの取得に失敗しました。');
      }
    } catch {
      setError('メニューの取得に失敗しました。');
    } finally {
      setMenuLoading(false);
    }
  }, [selectedTeamId, weekStart]);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // チーム変更
  const handleTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId);
    const params = new URLSearchParams(searchParams.toString());
    if (teamId) {
      params.set('team', teamId);
    } else {
      params.delete('team');
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  // AI メニュー生成
  const handleGenerate = async () => {
    if (!selectedTeamId) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/training/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeamId,
          weekStartDate: weekStart,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'メニュー生成に失敗しました。');
        return;
      }

      // 再取得
      await fetchMenu();
    } catch {
      setError('メニュー生成中にエラーが発生しました。');
    } finally {
      setGenerating(false);
    }
  };

  // 承認
  const handleApprove = async () => {
    if (!menu) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/training/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuId: menu.id,
          action: 'approve',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? '承認に失敗しました。');
        return;
      }

      await fetchMenu();
    } catch {
      setError('承認に失敗しました。');
    } finally {
      setActionLoading(false);
    }
  };

  // 配信
  const handleDistribute = async () => {
    if (!menu) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/training/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuId: menu.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? '配信に失敗しました。');
        return;
      }

      await fetchMenu();
    } catch {
      setError('配信に失敗しました。');
    } finally {
      setActionLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------

  return (
    <div>
      {/* ヘッダー */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">チームトレーニング</h1>

        <div className="flex items-center gap-3">
          {/* チームセレクター */}
          {teamsLoading ? (
            <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
          ) : (
            <select
              value={selectedTeamId}
              onChange={(e) => handleTeamChange(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">チームを選択</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}

          {/* 週セレクター */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o - 1)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm hover:bg-accent"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="min-w-[100px] text-center text-sm font-medium">
              {formatDate(weekStart)} 週
            </span>
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o + 1)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm hover:bg-accent"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="ml-1 text-xs text-primary hover:underline"
              >
                今週
              </button>
            )}
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* コンテンツ */}
      {!selectedTeamId ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">チームを選択してください。</p>
        </div>
      ) : menuLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : !menu ? (
        /* メニューなし — 生成 CTA */
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <SparklesIcon className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">
            メニューがありません
          </h3>
          <p className="mb-6 text-sm text-muted-foreground">
            AIを使ってチーム全体のトレーニングメニューを生成できます。
            <br />
            選手のコンディションデータと禁忌タグを考慮して作成されます。
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <SparklesIcon className="h-4 w-4" />
            {generating ? 'メニュー生成中...' : 'AIでチームメニューを生成'}
          </button>
        </div>
      ) : (
        /* メニュー表示 */
        <div>
          {/* ステータスバー */}
          <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={menu.status} />
              <span className="text-sm text-muted-foreground">
                生成日時:{' '}
                {new Date(menu.generated_at).toLocaleString('ja-JP')}
              </span>
              {menu.approved_at && (
                <span className="text-sm text-muted-foreground">
                  承認:{' '}
                  {new Date(menu.approved_at).toLocaleString('ja-JP')}
                </span>
              )}
              {menu.distributed_at && (
                <span className="text-sm text-muted-foreground">
                  配信:{' '}
                  {new Date(menu.distributed_at).toLocaleString('ja-JP')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {menu.status === 'draft' && (
                <>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating || actionLoading}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
                  >
                    再生成
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    承認
                  </button>
                </>
              )}
              {menu.status === 'approved' && (
                <button
                  type="button"
                  onClick={handleDistribute}
                  disabled={actionLoading}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  選手に配信
                </button>
              )}
            </div>
          </div>

          {/* 週間ロードノート */}
          {menu.weekly_load_note && (
            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm text-blue-800">
              <strong>週間ノート:</strong> {menu.weekly_load_note}
            </div>
          )}

          {/* Lock 選手通知 */}
          {menu.locked_athletes_notice &&
            menu.locked_athletes_notice.length > 0 && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-800">
                <strong>ロック選手への注意:</strong>
                <ul className="mt-1 list-inside list-disc">
                  {menu.locked_athletes_notice.map((notice, i) => (
                    <li key={i}>{notice}</li>
                  ))}
                </ul>
              </div>
            )}

          {/* 日別セッション */}
          <div className="space-y-4">
            {menu.team_sessions.map((session) => (
              <div
                key={session.day}
                className="rounded-lg border border-border bg-card"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">
                      {DAY_LABELS[session.day] ?? session.day}
                    </h3>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                      {SESSION_TYPE_LABELS[session.session_type] ??
                        session.session_type}
                    </span>
                    <IntensityBadge intensity={session.intensity} />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {session.duration_minutes}分
                  </span>
                </div>

                <div className="space-y-2 p-4">
                  {session.exercises.map((exercise, i) => (
                    <MenuCard key={i} exercise={exercise} index={i} />
                  ))}
                </div>

                {session.coaching_notes && (
                  <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    {session.coaching_notes}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 個別調整 */}
          {menu.individual_adjustments &&
            menu.individual_adjustments.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-lg font-semibold">個別調整</h3>
                <div className="space-y-3">
                  {menu.individual_adjustments.map((adj) => (
                    <div
                      key={adj.athlete_id}
                      className="rounded-lg border border-amber-200 bg-amber-50/30 p-4"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-medium">
                          {adj.athlete_name}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          — {adj.reason}
                        </span>
                      </div>

                      {adj.modifications.length > 0 && (
                        <div className="mb-1">
                          <span className="text-xs font-medium text-amber-700">
                            修正:
                          </span>
                          <ul className="ml-4 list-disc text-xs text-amber-700">
                            {adj.modifications.map((mod, i) => (
                              <li key={i}>{mod}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {adj.excluded_exercises.length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-red-600">
                            除外エクササイズ:
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {adj.excluded_exercises.map((ex, i) => (
                              <span
                                key={i}
                                className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600"
                              >
                                {ex}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    distributed: 'bg-blue-100 text-blue-700',
  };
  const labels: Record<string, string> = {
    draft: '下書き',
    approved: '承認済み',
    distributed: '配信済み',
  };

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-muted text-muted-foreground'}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function IntensityBadge({ intensity }: { intensity: string }) {
  const styles: Record<string, string> = {
    low: 'bg-green-100 text-green-700',
    moderate: 'bg-amber-100 text-amber-700',
    high: 'bg-red-100 text-red-700',
  };

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles[intensity] ?? 'bg-muted text-muted-foreground'}`}
    >
      強度: {INTENSITY_LABELS[intensity] ?? intensity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// インラインアイコン
// ---------------------------------------------------------------------------

function SparklesIcon({ className }: { className?: string }) {
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
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
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
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
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
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
