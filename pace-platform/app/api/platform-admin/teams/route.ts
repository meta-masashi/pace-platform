/**
 * PACE Platform — Platform Admin: 契約チーム一覧 API
 *
 * GET /api/platform-admin/teams
 *
 * 契約組織一覧（名称、ステータス、プラン、スタッフ数、選手数）を返す。
 * v_platform_team_overview ビューからデータ取得（個別レコードへの直接クエリ禁止）。
 *
 * クエリパラメータ:
 *   ?status=active|suspended|canceled (optional)
 *   ?plan=standard|pro|pro_cv|enterprise (optional)
 *
 * 設計書参照: architecture-v1.3-auth-admin.md セクション 3.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformAdmin, writeAuditLog } from '@/lib/api/platform-admin-guard';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createLogger } from '@/lib/observability/logger';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 環境変数が未設定です。');
  return createSupabaseAdmin(url, key, { auth: { persistSession: false } });
}

const log = createLogger('platform-admin');

// ---------------------------------------------------------------------------
// GET /api/platform-admin/teams
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. platform_admin 認可チェック
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.error;

  const { userId } = guard.auth;
  const searchParams = request.nextUrl.searchParams;
  const statusFilter = searchParams.get('status');
  const planFilter = searchParams.get('plan');

  // 入力バリデーション: ホワイトリスト外の値は400エラー
  const VALID_STATUSES = ['active', 'suspended', 'canceled'] as const;
  const VALID_PLANS = ['standard', 'pro', 'pro_cv', 'enterprise'] as const;

  if (statusFilter && !VALID_STATUSES.includes(statusFilter as typeof VALID_STATUSES[number])) {
    return NextResponse.json(
      { success: false, error: '無効なステータスパラメータです。' },
      { status: 400 },
    );
  }

  if (planFilter && !VALID_PLANS.includes(planFilter as typeof VALID_PLANS[number])) {
    return NextResponse.json(
      { success: false, error: '無効なプランパラメータです。' },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // 集計ビューからデータ取得
    let query = supabase
      .from('v_platform_team_overview')
      .select('*')
      .order('org_name', { ascending: true });

    if (statusFilter) {
      query = query.eq('subscription_status', statusFilter);
    }

    if (planFilter) {
      query = query.eq('current_plan', planFilter);
    }

    const { data, error } = await query;

    if (error) {
      log.error('チーム一覧取得エラー', { data: { error: error.message } });
      return NextResponse.json(
        { success: false, error: '契約チーム一覧の取得に失敗しました。' },
        { status: 500 },
      );
    }

    // 監査ログ
    await writeAuditLog({
      adminUserId: userId,
      action: 'view_teams',
      metadata: {
        statusFilter,
        planFilter,
        resultCount: data?.length ?? 0,
      },
      request,
    });

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('Teams API エラー', { data: { userId, error: errorMessage } });
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました。' },
      { status: 500 },
    );
  }
}
