/**
 * PACE Platform — Platform Admin: システムエラー集計 API
 *
 * GET /api/platform-admin/errors
 *
 * API エラー率推移、エラー種別集計、エンジン稼働状況を返す。
 * platform_admin_audit_logs およびシステムメトリクスから集計。
 *
 * クエリパラメータ:
 *   ?period=24h|7d|30d (optional, default: 7d)
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
// GET /api/platform-admin/errors
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. platform_admin 認可チェック
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.error;

  const { userId } = guard.auth;
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get('period') ?? '7d';

  if (!['24h', '7d', '30d'].includes(period)) {
    return NextResponse.json(
      { success: false, error: 'period は 24h, 7d, 30d のいずれかを指定してください。' },
      { status: 400 },
    );
  }

  // 期間の計算
  const periodMap: Record<string, string> = {
    '24h': '1 day',
    '7d': '7 days',
    '30d': '30 days',
  };
  const intervalSql = periodMap[period];

  try {
    const supabase = getSupabaseAdmin();

    // API エラーログの集計（api_error_logs テーブルがある場合）
    // ※ テーブルが存在しない場合はフォールバック
    const { data: errorLogs, error: errorLogsError } = await supabase
      .from('api_error_logs')
      .select('status_code, path, created_at')
      .gte('created_at', new Date(Date.now() - parsePeriodMs(period)).toISOString())
      .order('created_at', { ascending: false })
      .limit(1000);

    // エラー種別の集計
    const errorsByStatus: Record<string, number> = {};
    const errorsByPath: Record<string, number> = {};

    if (!errorLogsError && errorLogs) {
      for (const entry of errorLogs) {
        const statusKey = String(entry.status_code ?? 'unknown');
        errorsByStatus[statusKey] = (errorsByStatus[statusKey] ?? 0) + 1;

        const pathKey = String(entry.path ?? 'unknown');
        errorsByPath[pathKey] = (errorsByPath[pathKey] ?? 0) + 1;
      }
    }

    // 監査ログ
    await writeAuditLog({
      adminUserId: userId,
      action: 'view_errors',
      metadata: { period, totalErrors: errorLogs?.length ?? 0 },
      request,
    });

    // セキュリティ: パス情報からクエリパラメータを除去し、内部構造の過度な露出を防ぐ
    const sanitizedErrorsByPath = Object.entries(errorsByPath)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([rawPath, count]) => {
        try {
          const pathOnly = new URL(rawPath, 'http://localhost').pathname;
          return { path: pathOnly, count };
        } catch {
          return { path: rawPath.split('?')[0], count };
        }
      });

    return NextResponse.json({
      success: true,
      data: {
        period,
        interval: intervalSql,
        totalErrors: errorLogs?.length ?? 0,
        errorsByStatus,
        errorsByPath: sanitizedErrorsByPath,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('Errors API エラー', { data: { userId, error: errorMessage } });
    return NextResponse.json(
      { success: false, error: 'システムエラー集計の取得に失敗しました。' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function parsePeriodMs(period: string): number {
  switch (period) {
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    case '30d': return 30 * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}
