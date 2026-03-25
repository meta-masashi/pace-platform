/**
 * PACE Platform — 請求管理ページ（master 限定）
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function AdminBillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: staff } = await supabase
    .from('staff')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (!staff || staff.role !== 'master') {
    redirect('/dashboard');
  }

  // サブスクリプション情報
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('org_id', staff.org_id)
    .maybeSingle();

  // 統計データ
  const [staffResult, athleteResult] = await Promise.all([
    supabase
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', staff.org_id)
      .eq('is_active', true),
    supabase
      .from('athletes')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', staff.org_id),
  ]);

  const planLabel: Record<string, string> = {
    starter: 'Starter',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };

  const statusLabel: Record<string, string> = {
    active: '有効',
    trialing: 'トライアル中',
    past_due: '支払い遅延',
    read_only: '読み取り専用',
    canceled: '解約済み',
    unpaid: '未払い',
    inactive: '未契約',
  };

  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    trialing: 'bg-blue-100 text-blue-800',
    past_due: 'bg-yellow-100 text-yellow-800',
    read_only: 'bg-orange-100 text-orange-800',
    canceled: 'bg-gray-100 text-gray-600',
    unpaid: 'bg-red-100 text-red-800',
    inactive: 'bg-gray-100 text-gray-600',
  };

  const plan = subscription?.plan ?? 'starter';
  const status = subscription?.status ?? 'inactive';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">請求管理</h1>
        <p className="text-sm text-muted-foreground">
          プラン・決済情報の確認
        </p>
      </div>

      {/* 現在のプラン */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">現在のプラン</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">プラン</p>
            <p className="mt-1 text-2xl font-bold">{planLabel[plan] ?? plan}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">ステータス</p>
            <span
              className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-medium ${
                statusColor[status] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {statusLabel[status] ?? status}
            </span>
          </div>
        </div>

        {subscription?.stripe_customer_id && (
          <div className="mt-6">
            <a
              href={`${process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL ?? '#'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Stripe カスタマーポータルを開く
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        )}
      </div>

      {/* 利用状況 */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">利用状況</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border p-4">
            <p className="text-sm text-muted-foreground">アクティブスタッフ</p>
            <p className="mt-1 text-2xl font-bold">{staffResult.count ?? 0}</p>
          </div>
          <div className="rounded-md border border-border p-4">
            <p className="text-sm text-muted-foreground">登録選手</p>
            <p className="mt-1 text-2xl font-bold">{athleteResult.count ?? 0}</p>
          </div>
        </div>
      </div>

      {/* 請求期間 */}
      {subscription?.current_period_start && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">請求期間</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">現在の請求期間開始</p>
              <p className="mt-1 font-medium">
                {new Date(subscription.current_period_start).toLocaleDateString('ja-JP')}
              </p>
            </div>
            {subscription.current_period_end && (
              <div>
                <p className="text-sm text-muted-foreground">次回請求日</p>
                <p className="mt-1 font-medium">
                  {new Date(subscription.current_period_end).toLocaleDateString('ja-JP')}
                </p>
              </div>
            )}
          </div>
          {subscription.cancel_at_period_end && (
            <div className="mt-4 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              このサブスクリプションは期間終了時に解約予定です。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
