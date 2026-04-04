/**
 * pace-platform/app/api/platform-admin/plan-change-requests/route.ts
 * ============================================================
 * Platform Admin — プラン変更依頼一覧 API
 *
 * GET /api/platform-admin/plan-change-requests
 *
 * クエリパラメータ:
 *   ?status=pending|approved|rejected (optional, default: all)
 *   ?limit=20 (optional, default: 50)
 *   ?offset=0 (optional, default: 0)
 *
 * 認可: platform_admin のみ
 * ============================================================
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePlatformAdmin, writeAuditLog } from '@/lib/api/platform-admin-guard'
import { createClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/observability/logger'

const log = createLogger('billing')

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 環境変数が未設定です。')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.error

  const { userId } = guard.auth
  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  try {
    const supabase = getSupabaseAdmin()

    let query = supabase
      .from('plan_change_requests')
      .select(`
        id,
        org_id,
        requested_by,
        current_plan,
        requested_plan,
        status,
        notes,
        admin_notes,
        created_at,
        resolved_at,
        resolved_by
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) {
      log.error('plan-change-requests 一覧取得失敗', {
        data: { error: error.message },
      })
      return NextResponse.json(
        { success: false, error: 'プラン変更依頼一覧の取得に失敗しました。' },
        { status: 500 }
      )
    }

    // 組織名を補完
    const orgIds = [...new Set((data ?? []).map(r => r.org_id))]
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds)

    const orgMap = new Map((orgs ?? []).map(o => [o.id, o.name]))

    const requests = (data ?? []).map(r => ({
      ...r,
      orgName: orgMap.get(r.org_id) ?? 'Unknown',
    }))

    await writeAuditLog({
      adminUserId: userId,
      action: 'view_plan_change_requests',
      metadata: { statusFilter: status, resultCount: data?.length ?? 0 },
      request,
    })

    return NextResponse.json({
      success: true,
      requests,
      total: count ?? 0,
      limit,
      offset,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error('plan-change-requests API エラー', {
      data: { userId, error: errorMessage },
    })
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました。' },
      { status: 500 }
    )
  }
}
