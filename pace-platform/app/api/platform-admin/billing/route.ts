/**
 * pace-platform/app/api/platform-admin/billing/route.ts
 * ============================================================
 * Platform Admin — Billing API
 *
 * GET /api/platform-admin/billing
 *
 * 全契約組織の Stripe 決済データを集約して返す。
 * Supabase billing テーブル + Stripe API のハイブリッド。
 *
 * レスポンス:
 * {
 *   success: true,
 *   subscriptions: PlatformSubscription[],
 *   mrr: { current, previous, changePercent, trend[] },
 *   dunning: DunningOrg[],
 *   revenueBreakdown: RevenueBreakdown[]
 * }
 *
 * 認可: platform_admin のみ
 * アーキテクチャ設計書 v1.3 セクション 3.3 準拠
 * ============================================================
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePlatformAdmin, writeAuditLog } from '@/lib/api/platform-admin-guard'
import {
  getAllSubscriptions,
  getMrrTimeSeries,
  getDunningStatus,
  getRevenueBreakdown,
  type MrrTimeSeries,
  type PlatformSubscription,
  type DunningOrg,
  type RevenueBreakdown,
} from '@/lib/stripe/platform-admin'
import { createLogger } from '@/lib/observability/logger'

const log = createLogger('billing')

// ============================================================
// レスポンス型定義
// ============================================================

interface BillingApiResponse {
  success: boolean
  subscriptions: PlatformSubscription[]
  mrr: MrrTimeSeries
  dunning: DunningOrg[]
  revenueBreakdown: RevenueBreakdown[]
  error?: string
}

// ============================================================
// GET /api/platform-admin/billing
// ============================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. platform_admin 認可チェック
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.error

  const { userId } = guard.auth

  // 2. クエリパラメータ
  const searchParams = request.nextUrl.searchParams
  const mrrPeriod = (searchParams.get('mrr_period') ?? '30d') as '30d' | '90d' | '1y'

  // バリデーション
  if (!['30d', '90d', '1y'].includes(mrrPeriod)) {
    return NextResponse.json(
      { success: false, error: 'mrr_period は 30d, 90d, 1y のいずれかを指定してください。' },
      { status: 400 }
    )
  }

  try {
    // 3. データ取得（並列実行で高速化）
    const [subscriptions, mrr, dunning, revenueBreakdown] = await Promise.all([
      getAllSubscriptions(),
      getMrrTimeSeries(mrrPeriod),
      getDunningStatus(),
      getRevenueBreakdown(),
    ])

    // 4. 監査ログ
    await writeAuditLog({
      adminUserId: userId,
      action: 'view_billing',
      metadata: {
        mrrPeriod,
        subscriptionCount: subscriptions.length,
        dunningCount: dunning.length,
      },
      request,
    })

    // 5. レスポンス
    const response: BillingApiResponse = {
      success: true,
      subscriptions,
      mrr,
      dunning,
      revenueBreakdown,
    }

    return NextResponse.json(response)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error('Billing API エラー', {
      data: { userId, error: errorMessage },
    })

    return NextResponse.json(
      { success: false, error: 'Billing データ取得に失敗しました。' },
      { status: 500 }
    )
  }
}
