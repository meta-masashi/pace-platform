'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface Team {
  id: string;
  name: string;
}

export function TeamSelector() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const currentTeamId = searchParams.get('team') ?? '';

  useEffect(() => {
    async function fetchTeams() {
      try {
        const res = await fetch('/api/team/list');
        if (res.ok) {
          const data = await res.json();
          setTeams(data.teams ?? []);
        }
      } catch (err) { void err; // silently handled
        // Silently handle — teams may not be configured yet
      } finally {
        setLoading(false);
      }
    }
    fetchTeams();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      const teamId = e.target.value;
      if (teamId) {
        params.set('team', teamId);
      } else {
        params.delete('team');
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  if (loading) {
    return (
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
    );
  }

  if (teams.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        チーム未設定
      </span>
    );
  }

  return (
    <select
      value={currentTeamId}
      onChange={handleChange}
      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">すべてのチーム</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
}
