/**
 * pace-platform/app/api/platform-admin/plan-change-requests/[requestId]/reject/route.ts
 * ============================================================
 * Platform Admin — プラン変更却下 API
 *
 * POST /api/platform-admin/plan-change-requests/[requestId]/reject
 *
 * リクエストボディ:
 *   { admin_notes?: string }
 *
 * 認可: platform_admin のみ
 * ============================================================
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePlatformAdmin, writeAuditLog } from '@/lib/api/platform-admin-guard'
import { rejectPlanChange } from '@/lib/stripe/platform-admin'
import { validateUUID } from '@/lib/security/input-validator'
import { sanitizeString } from '@/lib/security/input-validator'
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

  // 2. リクエストボディ解析
  let adminNotes: string | undefined
  try {
    const body = await request.json()
    const rawNotes = body?.admin_notes
    adminNotes = typeof rawNotes === 'string' ? sanitizeString(rawNotes, 2000) : undefined
  } catch {
    // ボディなしでも OK（admin_notes はオプション）
  }

  try {
    // 3. プラン変更却下
    const result = await rejectPlanChange(requestId, userId, adminNotes)

    // 4. 監査ログ
    await writeAuditLog({
      adminUserId: userId,
      action: 'reject_plan_change',
      targetType: 'plan_change_request',
      targetId: requestId,
      metadata: {
        success: result.success,
        adminNotes,
        error: result.error,
      },
      request,
    })

    if (!result.success) {
      log.warn('プラン変更却下失敗', {
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
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error('プラン変更却下 API エラー', {
      data: { requestId, userId, error: errorMessage },
    })
    return NextResponse.json(
      { success: false, error: '却下処理に失敗しました。' },
      { status: 500 }
    )
  }
}
