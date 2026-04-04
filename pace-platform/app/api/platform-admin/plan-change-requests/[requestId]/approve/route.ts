/**
 * pace-platform/app/api/platform-admin/plan-change-requests/[requestId]/approve/route.ts
 * ============================================================
 * Platform Admin — プラン変更承認 API
 *
 * POST /api/platform-admin/plan-change-requests/[requestId]/approve
 *
 * - plan_change_requests のステータスを 'approved' に更新
 * - Stripe サブスクリプションを新プランの Price に変更
 * - プロレーション（日割り計算）対応
 * - 変更後の billing テーブル同期
 * - 冪等性保証（Stripe-Idempotency-Key = requestId）
 *
 * 認可: platform_admin のみ
 * ============================================================
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePlatformAdmin, writeAuditLog } from '@/lib/api/platform-admin-guard'
import { approvePlanChange } from '@/lib/stripe/platform-admin'
import { validateUUID } from '@/lib/security/input-validator'
import { createLogger } from '@/lib/observability/logger'

const log = createLogger('billing')

interface RouteContext {
  params: Promise<{ requestId: string }>
}

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  // 1. platform_admin 認可チェック
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.error

  const { userId } = guard.auth
  const { requestId } = await context.params

  if (!requestId || !validateUUID(requestId)) {
    return NextResponse.json(
      { success: false, error: '有効な requestId（UUID）を指定してください。' },
      { status: 400 }
    )
  }

  try {
    // 2. プラン変更承認 + Stripe 連携
    const result = await approvePlanChange(requestId, userId)

    // 3. 監査ログ
    await writeAuditLog({
      adminUserId: userId,
      action: 'approve_plan_change',
      targetType: 'plan_change_request',
      targetId: requestId,
      metadata: {
        success: result.success,
        oldPlan: result.oldPlan,
        newPlan: result.newPlan,
        stripeSubscriptionId: result.stripeSubscriptionId,
        error: result.error,
      },
      request,
    })

    if (!result.success) {
      log.warn('プラン変更承認失敗', {
        data: { requestId, error: result.error },
      })
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      requestId,
      oldPlan: result.oldPlan,
      newPlan: result.newPlan,
      stripeSubscriptionId: result.stripeSubscriptionId,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error('プラン変更承認 API エラー', {
      data: { requestId, userId, error: errorMessage },
    })
    return NextResponse.json(
      { success: false, error: '承認処理に失敗しました。' },
      { status: 500 }
    )
  }
}
