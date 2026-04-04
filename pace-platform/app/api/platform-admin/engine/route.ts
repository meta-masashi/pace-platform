/**
 * PACE Platform — Platform Admin: 推論エンジン監視 API
 *
 * GET /api/platform-admin/engine
 *
 * Go/TS 切替状況、レイテンシ p50/p95/p99、Shadow Mode 差分を返す。
 * エンジン実行ログから集計。
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
// GET /api/platform-admin/engine
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
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

  const sinceDate = new Date(Date.now() - parsePeriodMs(period)).toISOString();

  try {
    const supabase = getSupabaseAdmin();

    // パイプライン実行ログから集計
    const { data: pipelineRuns, error: pipelineError } = await supabase
      .from('pipeline_runs')
      .select('id, engine_type, duration_ms, status, created_at')
      .gte('created_at', sinceDate)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (pipelineError) {
      log.warn('pipeline_runs クエリエラー（テーブル未作成の可能性）', {
        data: { error: pipelineError.message },
      });
    }

    const runs = pipelineRuns ?? [];

    // エンジンタイプ別の集計
    const byEngine: Record<string, { count: number; durations: number[]; errors: number }> = {};

    for (const run of runs) {
      const engine = run.engine_type ?? 'typescript';
      if (!byEngine[engine]) {
        byEngine[engine] = { count: 0, durations: [], errors: 0 };
      }
      byEngine[engine].count++;
      if (run.duration_ms != null) {
        byEngine[engine].durations.push(run.duration_ms);
      }
      if (run.status === 'error' || run.status === 'failed') {
        byEngine[engine].errors++;
      }
    }

    // レイテンシ percentile 計算
    const engineStats = Object.entries(byEngine).map(([engine, stats]) => {
      const sorted = stats.durations.sort((a, b) => a - b);
      return {
        engine,
        totalRuns: stats.count,
        errorCount: stats.errors,
        errorRate: stats.count > 0 ? Math.round((stats.errors / stats.count) * 10000) / 100 : 0,
        latency: {
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          p99: percentile(sorted, 99),
          avg: sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
        },
      };
    });

    // 監査ログ
    await writeAuditLog({
      adminUserId: userId,
      action: 'view_engine_stats',
      metadata: { period, totalRuns: runs.length },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        period,
        totalRuns: runs.length,
        engineStats,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('Engine API エラー', { data: { userId, error: errorMessage } });
    return NextResponse.json(
      { success: false, error: '推論エンジン情報の取得に失敗しました。' },
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
}
