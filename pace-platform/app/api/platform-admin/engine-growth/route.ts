/**
 * PACE Platform — Platform Admin: エンジン成長率 API
 *
 * GET /api/platform-admin/engine-growth
 *
 * 組織別データ蓄積量、推論精度推移、データ品質スコアを返す。
 * v_platform_engine_growth ビューからデータ取得（個別レコードへの直接クエリ禁止）。
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
// GET /api/platform-admin/engine-growth
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.error;

  const { userId } = guard.auth;

  try {
    const supabase = getSupabaseAdmin();

    // 集計ビューからデータ取得
    const { data, error } = await supabase
      .from('v_platform_engine_growth')
      .select('*')
      .order('org_name', { ascending: true });

    if (error) {
      log.error('エンジン成長率取得エラー', { data: { error: error.message } });
      return NextResponse.json(
        { success: false, error: 'エンジン成長率データの取得に失敗しました。' },
        { status: 500 },
      );
    }

    // 全体サマリーの計算
    const records = data ?? [];
    const totalMetrics = records.reduce(
      (sum, r) => sum + (r.total_daily_metrics ?? 0),
      0,
    );
    const totalAssessments = records.reduce(
      (sum, r) => sum + (r.total_assessments ?? 0),
      0,
    );
    const avgContinuity = records.length > 0
      ? Math.round(
          records.reduce((sum, r) => sum + (r.checkin_continuity_pct ?? 0), 0) /
            records.length * 10,
        ) / 10
      : 0;
    const avgMissingRate = records.length > 0
      ? Math.round(
          records.reduce((sum, r) => sum + (r.missing_data_rate_pct ?? 0), 0) /
            records.length * 10,
        ) / 10
      : 0;

    // 監査ログ
    await writeAuditLog({
      adminUserId: userId,
      action: 'view_engine_growth',
      metadata: { resultCount: records.length, totalMetrics, totalAssessments },
      request,
    });

    return NextResponse.json({
      success: true,
      data: records,
      summary: {
        totalOrganizations: records.length,
        totalDailyMetrics: totalMetrics,
        totalAssessments,
        avgCheckinContinuityPct: avgContinuity,
        avgMissingDataRatePct: avgMissingRate,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('Engine Growth API エラー', { data: { userId, error: errorMessage } });
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました。' },
      { status: 500 },
    );
  }
}
