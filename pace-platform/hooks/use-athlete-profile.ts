'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

interface AthleteProfile {
  athleteId: string;
  name: string;
}

export function useAthleteProfile() {
  return useQuery<AthleteProfile | null>({
    queryKey: ['athlete', 'profile'],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: athlete } = await supabase
        .from('athletes')
        .select('id, name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!athlete) return null;

      return {
        athleteId: athlete.id as string,
        name: (athlete.name as string) ?? '',
      };
    },
    staleTime: 5 * 60_000, // プロフィールは5分キャッシュ
  });
}
