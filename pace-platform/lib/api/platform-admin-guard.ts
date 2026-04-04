/**
 * pace-platform/lib/api/platform-admin-guard.ts
 * ============================================================
 * Platform Admin 認可ガード
 *
 * 全 /api/platform-admin/* エンドポイントの共通認可チェック。
 * Supabase Auth セッションから user_id を取得し、
 * platform_admins テーブルに存在するか検証する。
 *
 * アーキテクチャ設計書 v1.3 セクション 3.4 準拠。
 * ============================================================
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/observability/logger'
import { rateLimit, rateLimitResponse } from '@/lib/security/rate-limit'

const log = createLogger('platform-admin')

// ============================================================
// 型定義
// ============================================================

export interface PlatformAdminAuth {
  userId: string
  adminId: string
}

export type PlatformAdminGuardResult =
  | { ok: true; auth: PlatformAdminAuth }
  | { ok: false; error: NextResponse }

// ============================================================
// メイン: platform_admin 認可チェック
// ============================================================

/**
 * リクエストユーザーが platform_admin であることを検証する。
 *
 * - 認証チェック（Supabase Auth セッション）
 * - platform_admins テーブルとの突合
 * - 失敗時は適切な HTTP レスポンスを返す
 *
 * @returns PlatformAdminGuardResult
 *
 * @example
 * ```ts
 * export async function GET() {
 *   const guard = await requirePlatformAdmin()
 *   if (!guard.ok) return guard.error
 *   const { userId, adminId } = guard.auth
 *   // ... 認可済み処理
 * }
 * ```
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminGuardResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      log.warn('platform-admin guard: 未認証リクエスト')
      return {
        ok: false,
        error: NextResponse.json(
          { success: false, error: '認証が必要です。' },
          { status: 401 }
        ),
      }
    }

    const { data: admin, error: queryError } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (queryError) {
      log.error('platform-admin guard: DB クエリエラー', {
        data: { userId: user.id, error: queryError.message },
      })
      return {
        ok: false,
        error: NextResponse.json(
          { success: false, error: 'サーバーエラーが発生しました。' },
          { status: 500 }
        ),
      }
    }

    if (!admin) {
      log.warn('platform-admin guard: 権限なし', { data: { userId: user.id } })
      return {
        ok: false,
        error: NextResponse.json(
          { success: false, error: 'プラットフォーム管理者権限が必要です。' },
          { status: 403 }
        ),
      }
    }

    // レート制限: platform_admin API 全体で 120回/分
    const rl = await rateLimit(user.id, 'platform-admin:global', { maxRequests: 120, windowMs: 60_000 })
    if (!rl.allowed) {
      return {
        ok: false,
        error: rateLimitResponse(rl),
      }
    }

    return {
      ok: true,
      auth: { userId: user.id, adminId: admin.id },
    }
  } catch (err) {
    log.errorFromException('platform-admin guard: 予期しないエラー', err)
    return {
      ok: false,
      error: NextResponse.json(
        { success: false, error: 'サーバーエラーが発生しました。' },
        { status: 500 }
      ),
    }
  }
}

// ============================================================
// 監査ログ記録ヘルパー
// ============================================================

export interface AuditLogParams {
  adminUserId: string
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  request?: Request
}

/**
 * platform_admin_audit_logs に操作ログを書き込む。
 * WORM テーブルのため INSERT のみ。
 */
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const supabase = await createClient()

    const ipAddress = params.request?.headers.get('x-forwarded-for')
      ?? params.request?.headers.get('x-real-ip')
      ?? null
    const userAgent = params.request?.headers.get('user-agent') ?? null

    const { error } = await supabase
      .from('platform_admin_audit_logs')
      .insert({
        admin_user_id: params.adminUserId,
        action: params.action,
        target_type: params.targetType ?? null,
        target_id: params.targetId ?? null,
        metadata: params.metadata ?? {},
        ip_address: ipAddress,
        user_agent: userAgent,
      })

    if (error) {
      log.error('監査ログ書き込み失敗', {
        data: { action: params.action, error: error.message },
      })
    }
  } catch (err) {
    // 監査ログの失敗でメイン処理をブロックしない
    log.errorFromException('監査ログ書き込み例外', err)
  }
}
