'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// RoleSwitchToggle — スタッフ/選手ビュー切替
// ---------------------------------------------------------------------------
// 表示条件:
// 1. staff_members AND athletes に同一 user_id が存在する
// 2. login_context === 'staff' の場合のみ表示（athlete ログインでは非表示）

interface RoleSwitchToggleProps {
  userId: string;
}

export function RoleSwitchToggle({ userId }: RoleSwitchToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [canSwitch, setCanSwitch] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAthleteView = pathname.startsWith('/home') || pathname.startsWith('/checkin') || pathname.startsWith('/history');

  useEffect(() => {
    async function checkDualRole() {
      try {
        const supabase = createClient();

        // login_context チェック
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const loginContext = user.user_metadata?.login_context;
        if (loginContext === 'athlete') {
          // 選手URLからログインした場合は切替不可
          setCanSwitch(false);
          setLoading(false);
          return;
        }

        // staff_members に存在するか
        const { data: staff } = await supabase
          .from('staff_members')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (!staff) { setLoading(false); return; }

        // athletes にも存在するか
        const { data: athlete } = await supabase
          .from('athletes')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        setCanSwitch(!!athlete);
      } catch {
        setCanSwitch(false);
      } finally {
        setLoading(false);
      }
    }

    checkDualRole();
  }, [userId]);

  if (loading || !canSwitch) return null;

  // 選手ビュー表示中 → スタッフに戻るバナー
  if (isAthleteView) {
    return (
      <div className="flex items-center justify-between bg-amber-50 px-4 py-2 text-sm border-b border-amber-200">
        <span className="text-amber-800">
          現在、選手ビューを表示しています
        </span>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200"
        >
          スタッフビューに戻る &rarr;
        </button>
      </div>
    );
  }

  // スタッフビュー表示中 → 選手ビューに切替ボタン
  return (
    <button
      type="button"
      onClick={() => router.push('/home')}
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        <path d="M21 3v5h-5" />
      </svg>
      選手ビューに切替
    </button>
  );
}
