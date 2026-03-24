'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AssessmentType } from '@/lib/bayes/types';

interface Athlete {
  id: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
}

const ASSESSMENT_TYPES: { value: AssessmentType; label: string; description: string }[] = [
  {
    value: 'acute',
    label: 'F1 急性アセスメント',
    description: '急性外傷・痛みの評価（131ノード CAT）',
  },
  {
    value: 'chronic',
    label: '慢性アセスメント',
    description: '慢性的な痛み・機能障害の評価（開発中）',
  },
  {
    value: 'performance',
    label: 'パフォーマンス評価',
    description: 'パフォーマンス指標の総合評価（開発中）',
  },
];

export function NewAssessmentForm() {
  const router = useRouter();

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('acute');
  const [loading, setLoading] = useState(false);
  const [fetchingTeams, setFetchingTeams] = useState(true);
  const [fetchingAthletes, setFetchingAthletes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch teams
  useEffect(() => {
    async function fetchTeams() {
      try {
        const res = await fetch('/api/team/list');
        const json = await res.json();
        setTeams(json.teams ?? []);
        if (json.teams?.length === 1) {
          setSelectedTeam(json.teams[0].id);
        }
      } catch {
        setError('チーム一覧の取得に失敗しました。');
      } finally {
        setFetchingTeams(false);
      }
    }
    fetchTeams();
  }, []);

  // Fetch athletes when team is selected
  useEffect(() => {
    if (!selectedTeam) {
      setAthletes([]);
      setSelectedAthlete('');
      return;
    }

    async function fetchAthletes() {
      setFetchingAthletes(true);
      try {
        const res = await fetch(
          `/api/team/dashboard?team_id=${encodeURIComponent(selectedTeam)}`,
        );
        const json = await res.json();
        // Dashboard returns athletes in alerts; use team list for full roster
        // For now, query athletes from the team endpoint
        const athleteRes = await fetch('/api/team/list');
        const athleteJson = await athleteRes.json();
        // We need a dedicated athletes list endpoint - use dashboard data for now
        if (json.success && json.data) {
          // Extract unique athlete names from alerts
          const alertAthletes = (json.data.alerts ?? []).map(
            (a: { athleteId: string; athleteName: string }) => ({
              id: a.athleteId,
              name: a.athleteName,
            }),
          );
          // Deduplicate
          const seen = new Set<string>();
          const unique = alertAthletes.filter((a: Athlete) => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          });
          setAthletes(unique);
        }
      } catch {
        setError('選手一覧の取得に失敗しました。');
      } finally {
        setFetchingAthletes(false);
      }
    }
    fetchAthletes();
  }, [selectedTeam]);

  async function handleStart() {
    if (!selectedAthlete) {
      setError('選手を選択してください。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/assessment/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete_id: selectedAthlete,
          assessment_type: assessmentType,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? 'アセスメントの開始に失敗しました。');
        return;
      }

      router.push(`/assessment/${json.data.session_id}`);
    } catch {
      setError('ネットワークエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-6">
      {/* Team selector */}
      <div className="space-y-2">
        <label
          htmlFor="team-select"
          className="text-sm font-medium text-foreground"
        >
          チーム
        </label>
        <select
          id="team-select"
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          disabled={fetchingTeams}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
        >
          <option value="">チームを選択...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Athlete selector */}
      <div className="space-y-2">
        <label
          htmlFor="athlete-select"
          className="text-sm font-medium text-foreground"
        >
          選手
        </label>
        <select
          id="athlete-select"
          value={selectedAthlete}
          onChange={(e) => setSelectedAthlete(e.target.value)}
          disabled={!selectedTeam || fetchingAthletes}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
        >
          <option value="">選手を選択...</option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {fetchingAthletes && (
          <p className="text-xs text-muted-foreground">読み込み中...</p>
        )}
      </div>

      {/* Assessment type */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          アセスメントタイプ
        </label>
        <div className="space-y-2">
          {ASSESSMENT_TYPES.map((type) => (
            <label
              key={type.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                assessmentType === type.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/30'
              } ${type.value !== 'acute' ? 'opacity-50' : ''}`}
            >
              <input
                type="radio"
                name="assessment_type"
                value={type.value}
                checked={assessmentType === type.value}
                onChange={(e) =>
                  setAssessmentType(e.target.value as AssessmentType)
                }
                disabled={type.value !== 'acute'}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="text-sm font-medium">{type.label}</p>
                <p className="text-xs text-muted-foreground">
                  {type.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-critical-200 bg-critical-50 px-3 py-2">
          <p className="text-sm text-critical-700">{error}</p>
        </div>
      )}

      {/* Start button */}
      <button
        type="button"
        onClick={handleStart}
        disabled={loading || !selectedAthlete}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            開始中...
          </span>
        ) : (
          'アセスメント開始'
        )}
      </button>
    </div>
  );
}
