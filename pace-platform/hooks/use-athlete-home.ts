'use client';

import { useQuery } from '@tanstack/react-query';

interface AthleteHomeData {
  v6?: {
    status: 'TEAL' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
    score: number;
    actionOfDay: string;
    primaryTrigger?: string;
    compass: {
      recovery?: number;
      movement?: number;
      loadCapacity?: number;
      mentalReadiness?: number;
    };
    insight: string;
  };
  conditioning?: {
    conditioningScore: number;
    fitnessEwma: number;
    fatigueEwma: number;
    acwr: number;
    fitnessTrend: number[];
    fatigueTrend: number[];
    insight: string;
    latestDate: string;
    trendDirection?: 'improving' | 'stable' | 'declining';
    /** 直近14日分のトレンドデータ（チャート用） */
    trendData?: Array<{
      date: string;
      conditioning_score: number | null;
      fitness_ewma: number | null;
      fatigue_ewma: number | null;
      acwr: number | null;
      srpe: number | null;
    }>;
    /** 直近7日分のフィードデータ */
    feedEntries?: Array<{
      date: string;
      conditioningScore: number | null;
      fitnessEwma: number | null;
      fatigueEwma: number | null;
      acwr: number | null;
      sleepScore: number | null;
      insight?: string;
    }>;
  };
  validDataDays: number;
}

export function useAthleteHome(athleteId: string) {
  return useQuery<AthleteHomeData>({
    queryKey: ['athlete', 'home', athleteId],
    queryFn: async () => {
      const res = await fetch(`/api/athlete/home-data/${athleteId}`);
      if (!res.ok) throw new Error('Failed to fetch home data');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Unknown error');
      return json.data as AthleteHomeData;
    },
    enabled: !!athleteId,
  });
}
