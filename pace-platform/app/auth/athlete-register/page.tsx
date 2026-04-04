'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { TeamCodeInput } from '@/components/auth/team-code-input';
import { signInWithMagicLink } from '@/lib/supabase/auth-helpers';

// ---------------------------------------------------------------------------
// 選手新規登録フロー（ステップ式）
// ---------------------------------------------------------------------------

type Step = 'email' | 'email-sent' | 'team-code' | 'complete';

function AthleteRegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // チームコードステップから開始する場合（Magic Link タップ後のリダイレクト）
  const initialStep = searchParams.get('step') === 'team-code' ? 'team-code' as Step : 'email' as Step;
  const [step, setStep] = useState<Step>(initialStep);
  const [teamName, setTeamName] = useState('');

  async function handleMagicLink(email: string) {
    const result = await signInWithMagicLink(email, 'athlete');
    if (result.success) {
      setStep('email-sent');
    }
    return result;
  }

  async function handleTeamCode(code: string) {
    const res = await fetch('/api/auth/athlete-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_code: code }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: data.error ?? 'チームコードの検証に失敗しました。',
      };
    }

    setTeamName(data.team_name ?? '');
    setStep('complete');
    return { success: true, teamName: data.team_name };
  }

  // Step 1: メール入力
  if (step === 'email') {
    return (
      <AuthCard
        title="選手アカウント作成"
        subtitle="for Athletes"
        variant="athlete"
        footer={
          <Link
            href="/auth/athlete-login"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            すでにアカウントをお持ちの方 &rarr; ログインはこちら
          </Link>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-xs text-emerald-700">
              メールアドレスにログインリンクを送信します。リンクをタップすると、チームへの参加手続きに進めます。
            </p>
          </div>
          <MagicLinkForm
            variant="default"
            onSubmit={handleMagicLink}
            buttonLabel="登録リンクを送信"
          />
        </div>
      </AuthCard>
    );
  }

  // Step 2: メール確認待ち（MagicLinkForm内部のsent状態と重複するが明示的に管理）
  if (step === 'email-sent') {
    return (
      <AuthCard
        title="メールを確認してください"
        subtitle="for Athletes"
        variant="athlete"
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <svg
              className="h-8 w-8 text-emerald-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">
            登録リンクを送信しました。メールのリンクをタップして登録を続けてください。
          </p>
          <p className="text-xs text-gray-400">
            メールが届かない場合は、迷惑メールフォルダをご確認ください。
          </p>
        </div>
      </AuthCard>
    );
  }

  // Step 3: チームコード入力
  if (step === 'team-code') {
    return (
      <AuthCard
        title="チームに参加する"
        subtitle="for Athletes"
        variant="athlete"
      >
        <TeamCodeInput onSubmit={handleTeamCode} />
      </AuthCard>
    );
  }

  // Step 4: 完了
  return (
    <AuthCard
      title="登録が完了しました！"
      subtitle="for Athletes"
      variant="athlete"
    >
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <svg
            className="h-8 w-8 text-emerald-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        {teamName && (
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{teamName}</span>{' '}
            に参加しました。
          </p>
        )}

        <button
          type="button"
          onClick={() => router.push('/home')}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          ホーム画面へ
        </button>
      </div>
    </AuthCard>
  );
}

export default function AthleteRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <AthleteRegisterContent />
    </Suspense>
  );
}
