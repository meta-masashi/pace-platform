'use client';

/**
 * PACE Platform — レポート生成コンテンツ
 *
 * 選手レポートおよびチーム MDT レポートの生成フォームと
 * レポートビューア（プレビュー＋印刷）を提供する。
 */

import { useCallback, useEffect, useState } from 'react';
import { ReportViewer } from './report-viewer';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Athlete {
  id: string;
  name: string;
  position: string;
  number: string;
}

interface Team {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * レポート生成メインコンテンツ
 */
export function ReportsContent() {
  // ----- 状態管理 -----
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(true);

  const [selectedAthleteId, setSelectedAthleteId] = useState('');
  const [athleteFormat, setAthleteFormat] = useState<'summary' | 'detailed'>('summary');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamDate, setTeamDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const [reportUrl, setReportUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // ----- マスターデータ取得 -----
  useEffect(() => {
    async function fetchMasterData() {
      try {
        const [athletesRes, teamsRes] = await Promise.all([
          fetch('/api/team/dashboard').then((r) => r.json()),
          fetch('/api/team/list').then((r) => r.json()),
        ]);

        if (athletesRes.data?.athletes) {
          setAthletes(athletesRes.data.athletes);
        }
        if (teamsRes.teams) {
          setTeams(teamsRes.teams);
          // 自動で最初のチームを選択（仕様: ログイン時に紐付け済み）
          if (teamsRes.teams.length > 0 && !selectedTeamId) {
            setSelectedTeamId(teamsRes.teams[0].id);
          }
        }
      } catch (e) {
        console.error('マスターデータ取得エラー:', e);
      } finally {
        setLoadingMaster(false);
      }
    }
    fetchMasterData();
  }, []);

  // ----- 選手レポート生成 -----
  const generateAthleteReport = useCallback(async () => {
    if (!selectedAthleteId) return;
    setGenerating(true);
    setError('');
    setReportUrl('');

    try {
      const url = `/api/reports/athlete?athleteId=${encodeURIComponent(selectedAthleteId)}&format=${athleteFormat}`;
      const res = await fetch(url);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'レポート生成に失敗しました。');
      }

      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      setReportUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました。');
    } finally {
      setGenerating(false);
    }
  }, [selectedAthleteId, athleteFormat]);

  // ----- チームレポート生成 -----
  const generateTeamReport = useCallback(async () => {
    if (!selectedTeamId) return;
    setGenerating(true);
    setError('');
    setReportUrl('');

    try {
      const url = `/api/reports/team?teamId=${encodeURIComponent(selectedTeamId)}&date=${encodeURIComponent(teamDate ?? '')}`;
      const res = await fetch(url);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'レポート生成に失敗しました。');
      }

      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      setReportUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました。');
    } finally {
      setGenerating(false);
    }
  }, [selectedTeamId, teamDate]);

  // ----- 描画 -----
  if (loadingMaster) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 生成フォーム */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 選手レポート */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold">選手レポート生成</h2>
          <div className="space-y-3">
            <div>
              <label
                htmlFor="athlete-select"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                選手を選択
              </label>
              <select
                id="athlete-select"
                value={selectedAthleteId}
                onChange={(e) => setSelectedAthleteId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">-- 選手を選択 --</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}（{a.position} #{a.number}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="format-select"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                レポート形式
              </label>
              <select
                id="format-select"
                value={athleteFormat}
                onChange={(e) =>
                  setAthleteFormat(e.target.value as 'summary' | 'detailed')
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="summary">サマリー</option>
                <option value="detailed">詳細</option>
              </select>
            </div>

            <button
              type="button"
              onClick={generateAthleteReport}
              disabled={!selectedAthleteId || generating}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {generating ? '生成中...' : '選手レポートを生成'}
            </button>
          </div>
        </div>

        {/* チームレポート */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold">
            チームレポート生成
          </h2>
          <div className="space-y-3">
            <div>
              <label
                htmlFor="team-select"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                チームを選択
              </label>
              <select
                id="team-select"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">-- チームを選択 --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="date-input"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                レポート日付
              </label>
              <input
                id="date-input"
                type="date"
                value={teamDate}
                onChange={(e) => setTeamDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={generateTeamReport}
              disabled={!selectedTeamId || generating}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {generating ? '生成中...' : 'チームレポートを生成'}
            </button>
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* レポートビューア */}
      <ReportViewer reportUrl={reportUrl} loading={generating} />
    </div>
  );
}
