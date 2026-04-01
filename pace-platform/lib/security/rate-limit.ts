/**
 * PACE Platform — 汎用 API レートリミッター
 *
 * Supabase の rate_limit_log テーブルを使用したスライディングウィンドウ方式。
 * サーバーレス環境でも永続化される（インメモリではない）。
 *
 * 使い方:
 *   import { rateLimit } from '@/lib/security/rate-limit'
 *
 *   const result = await rateLimit(userId, 'admin/staff:POST', { maxRequests: 10, windowMs: 60_000 })
 *   if (!result.allowed) {
 *     return NextResponse.json({ error: result.error }, { status: 429 })
 *   }
 */

import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** ウィンドウ内の最大リクエスト数（デフォルト: 30） */
  maxRequests?: number
  /** スライディングウィンドウの長さ（ミリ秒、デフォルト: 60_000 = 1分） */
  windowMs?: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
  error?: string
}

// ---------------------------------------------------------------------------
// デフォルト設定
// ---------------------------------------------------------------------------

const DEFAULT_MAX_REQUESTS = 30
const DEFAULT_WINDOW_MS = 60_000 // 1分

// ---------------------------------------------------------------------------
// Supabase service client（遅延ロード）
// ---------------------------------------------------------------------------

async function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const { createClient } = await import('@supabase/supabase-js')
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// メイン: レートリミットチェック
// ---------------------------------------------------------------------------

/**
 * スライディングウィンドウ方式でレートリミットをチェックする。
 *
 * rate_limit_log テーブルにリクエストを記録し、
 * ウィンドウ内のリクエスト数が上限を超えていないかチェックする。
 *
 * DB接続不可の場合はフェイルオープン（リクエストをブロックしない）。
 *
 * @param userId  ユーザー識別子（auth.uid()）
 * @param route   ルート識別子（例: "admin/staff:POST"）
 * @param config  レートリミット設定
 */
export async function rateLimit(
  userId: string,
  route: string,
  config?: RateLimitConfig,
): Promise<RateLimitResult> {
  const maxRequests = config?.maxRequests ?? DEFAULT_MAX_REQUESTS
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS

  const supabase = await getServiceClient()
  if (!supabase) {
    // DB 接続不可: フェイルオープン
    return { allowed: true, remaining: maxRequests, retryAfterMs: 0 }
  }

  const key = `${userId}:${route}`
  const windowStart = new Date(Date.now() - windowMs).toISOString()

  try {
    // 現在のウィンドウ内のリクエスト数をカウント
    const { count, error: countError } = await supabase
      .from('rate_limit_log')
      .select('id', { count: 'exact', head: true })
      .eq('key', key)
      .gte('ts', windowStart)

    if (countError) {
      console.warn('[rate-limit] カウントクエリ失敗（フェイルオープン）:', countError.message)
      return { allowed: true, remaining: maxRequests, retryAfterMs: 0 }
    }

    const currentCount = count ?? 0

    if (currentCount >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: windowMs,
        error: `リクエスト制限に達しました。${Math.ceil(windowMs / 1000)}秒後に再試行してください。`,
      }
    }

    // リクエストを記録（ベストエフォート）
    await supabase.from('rate_limit_log').insert({ key, ts: new Date().toISOString() })

    return {
      allowed: true,
      remaining: maxRequests - currentCount - 1,
      retryAfterMs: 0,
    }
  } catch (err) {
    console.warn('[rate-limit] レートリミットチェック失敗（フェイルオープン）:', err)
    return { allowed: true, remaining: maxRequests, retryAfterMs: 0 }
  }
}

// ---------------------------------------------------------------------------
// ヘルパー: 429 レスポンス生成
// ---------------------------------------------------------------------------

/**
 * レートリミット超過時の 429 レスポンスを生成する。
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000))

  return NextResponse.json(
    { success: false, error: result.error ?? 'リクエスト制限に達しました。' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    },
  )
}
