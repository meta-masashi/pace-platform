/**
 * PACE Platform — Platform Admin: 利用率 API
 *
 * GET /api/platform-admin/usage
 *
 * 組織別 DAU/MAU、チェックイン率、機能別利用率を返す。
 * v_platform_usage_stats ビューからデータ取得（個別レコードへの直接クエリ禁止）。
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
// GET /api/platform-admin/usage
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.error;

  const { userId } = guard.auth;

  try {
    const supabase = getSupabaseAdmin();

    // 集計ビューからデータ取得
    const { data, error } = await supabase
      .from('v_platform_usage_stats')
      .select('*')
      .order('org_name', { ascending: true });

    if (error) {
      log.error('利用率取得エラー', { data: { error: error.message } });
      return NextResponse.json(
        { success: false, error: '利用率データの取得に失敗しました。' },
        { status: 500 },
      );
    }

    // 全体サマリーの計算
    const records = data ?? [];
    const totalDau = records.reduce((sum, r) => sum + (r.dau ?? 0), 0);
    const totalMau = records.reduce((sum, r) => sum + (r.mau ?? 0), 0);
    const totalActiveAthletes = records.reduce(
      (sum, r) => sum + (r.total_active_athletes ?? 0),
      0,
    );

    // 監査ログ
    await writeAuditLog({
      adminUserId: userId,
      action: 'view_usage',
      metadata: { resultCount: records.length, totalDau, totalMau },
      request,
    });

    return NextResponse.json({
      success: true,
      data: records,
      summary: {
        totalOrganizations: records.length,
        totalDau,
        totalMau,
        totalActiveAthletes,
        overallDauRate: totalActiveAthletes > 0
          ? Math.round((totalDau / totalActiveAthletes) * 1000) / 10
          : 0,
        overallMauRate: totalActiveAthletes > 0
          ? Math.round((totalMau / totalActiveAthletes) * 1000) / 10
          : 0,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('Usage API エラー', { data: { userId, error: errorMessage } });
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました。' },
      { status: 500 },
    );
  }
}
