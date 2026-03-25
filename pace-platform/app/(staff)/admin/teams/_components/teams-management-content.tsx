'use client';

import { useState } from 'react';

interface Team {
  id: string;
  name: string;
  created_at: string;
  staff_count: number;
  athlete_count: number;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  team_id: string | null;
}

interface Props {
  initialTeams: Team[];
  staffList: StaffMember[];
}

export function TeamsManagementContent({ initialTeams, staffList }: Props) {
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigningStaff, setAssigningStaff] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>(staffList);

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setTeams((prev) => [...prev, json.data]);
        setNewTeamName('');
      } else {
        setError(json.error ?? 'チームの作成に失敗しました。');
      }
    } catch {
      setError('通信エラーが発生しました。');
    } finally {
      setCreating(false);
    }
  }

  async function handleAssignStaff(staffId: string, teamId: string | null) {
    setAssigningStaff(staffId);
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, team_id: teamId }),
      });
      const json = await res.json();
      if (json.success) {
        setStaff((prev) =>
          prev.map((s) => (s.id === staffId ? { ...s, team_id: teamId } : s))
        );
        // Update team counts
        setTeams((prev) =>
          prev.map((t) => ({
            ...t,
            staff_count: staff.filter(
              (s) =>
                (s.id === staffId ? teamId : s.team_id) === t.id
            ).length,
          }))
        );
      }
    } catch (err) {
      console.error('スタッフ割り当てエラー:', err);
    } finally {
      setAssigningStaff(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* チーム作成フォーム */}
      <form onSubmit={handleCreateTeam} className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="team-name" className="mb-1 block text-sm text-muted-foreground">
            新しいチーム名
          </label>
          <input
            id="team-name"
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="例: トップチーム、U-18"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !newTeamName.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {creating ? '作成中...' : 'チーム作成'}
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* チーム一覧 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => {
          const teamStaff = staff.filter((s) => s.team_id === team.id);
          return (
            <div
              key={team.id}
              className="rounded-lg border border-border bg-card p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{team.name}</h3>
              </div>

              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>スタッフ: {teamStaff.length}名</span>
                <span>選手: {team.athlete_count}名</span>
              </div>

              {/* チーム所属スタッフ */}
              {teamStaff.length > 0 && (
                <div className="space-y-1">
                  {teamStaff.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1 text-sm"
                    >
                      <span>
                        {s.name}{' '}
                        <span className="text-xs text-muted-foreground">({s.role})</span>
                      </span>
                      <button
                        disabled={assigningStaff === s.id}
                        onClick={() => handleAssignStaff(s.id, null)}
                        className="text-xs text-muted-foreground hover:text-red-500"
                        title="チームから外す"
                      >
                        外す
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* スタッフ追加 */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAssignStaff(e.target.value, team.id);
                  }
                }}
                disabled={assigningStaff !== null}
                className="w-full rounded-md border border-dashed border-border bg-background px-2 py-1.5 text-sm text-muted-foreground focus:border-primary focus:outline-none"
              >
                <option value="">+ スタッフを追加...</option>
                {staff
                  .filter((s) => s.team_id !== team.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
              </select>

              <p className="text-xs text-muted-foreground">
                作成日: {new Date(team.created_at).toLocaleDateString('ja-JP')}
              </p>
            </div>
          );
        })}
      </div>

      {teams.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          チームがまだ作成されていません。上のフォームから作成してください。
        </div>
      )}
    </div>
  );
}
