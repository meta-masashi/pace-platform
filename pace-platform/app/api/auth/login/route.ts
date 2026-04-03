/**
 * PACE Platform — セキュアログイン API
 *
 * POST /api/auth/login
 *
 * セキュリティチェック:
 *   1. ブルートフォース保護 — 同一メールで 15 分以内に 5 回失敗 → アカウントロック
 *   2. IP ベースレート制限 — 同一 IP から 15 分以内に 20 回試行 → IP ブロック
 *   3. 全イベントを auth_events テーブルに記録（監査ログ）
 *   4. ロック中のログイン試行も記録し、ロック解除までの残り時間を返却
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/observability/logger'

const log = createLogger('auth')

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

/** 最大連続失敗回数（この回数を超えるとロック） */
const MAX_FAILED_ATTEMPTS = 5

/** IP あたりの最大試行回数 */
const MAX_IP_ATTEMPTS = 20

/** ロック/カウントのウィンドウ（ミリ秒）*/
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000 // 15分

// ---------------------------------------------------------------------------
// Supabase service client シングルトン
// auth_events は RLS で保護されているため service_role 必要
// ---------------------------------------------------------------------------

let _serviceClient: SupabaseClient | null | undefined

async function getServiceClient(): Promise<SupabaseClient | null> {
  if (_serviceClient !== undefined) return _serviceClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    _serviceClient = null
    return null
  }

  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  _serviceClient = createServiceClient(url, key)
  return _serviceClient
}

// ---------------------------------------------------------------------------
// リクエストスキーマ
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email('メールアドレスの形式が不正です').max(254),
  password: z.string().min(1, 'パスワードを入力してください').max(200),
})

// ---------------------------------------------------------------------------
// ヘルパー: IP アドレス取得
// ---------------------------------------------------------------------------

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '0.0.0.0'
  )
}

// ---------------------------------------------------------------------------
// ヘルパー: イベント記録（fire-and-forget 可能）
// ---------------------------------------------------------------------------

async function recordAuthEvent(
  service: SupabaseClient,
  params: {
    email: string
    ipAddress: string
    userAgent: string
    eventType: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  try {
    const { error } = await service.from('auth_events').insert({
      email: params.email,
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      event_type: params.eventType,
      metadata: params.metadata ?? {},
    })
    if (error) log.warn('イベント記録失敗', { data: { message: error.message } })
  } catch (err) {
    log.errorFromException('イベント記録例外', err)
  }
}

// ---------------------------------------------------------------------------
// ヘルパー: 失敗回数カウント
// ---------------------------------------------------------------------------

async function getFailedAttempts(
  service: SupabaseClient,
  email: string,
  windowStart: string,
): Promise<number> {
  const { count } = await service
    .from('auth_events')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('event_type', 'login_failed')
    .gte('created_at', windowStart)

  return count ?? 0
}

async function getIpAttempts(
  service: SupabaseClient,
  ip: string,
  windowStart: string,
): Promise<number> {
  const { count } = await service
    .from('auth_events')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .in('event_type', ['login_failed', 'login_success'])
    .gte('created_at', windowStart)

  return count ?? 0
}

// ---------------------------------------------------------------------------
// ヘルパー: 最後のロックイベント確認
// ---------------------------------------------------------------------------

async function getLastLockEvent(
  service: SupabaseClient,
  email: string,
  windowStart: string,
): Promise<{ locked: boolean; lockedAt?: string }> {
  // ロックイベントがウィンドウ内にあるか
  const { data: lockEvent } = await service
    .from('auth_events')
    .select('created_at')
    .eq('email', email)
    .eq('event_type', 'account_locked')
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lockEvent) return { locked: false }

  // ロック後にアンロックがあるか
  const { data: unlockEvent } = await service
    .from('auth_events')
    .select('created_at')
    .eq('email', email)
    .eq('event_type', 'account_unlocked')
    .gt('created_at', lockEvent.created_at)
    .limit(1)
    .maybeSingle()

  if (unlockEvent) return { locked: false }

  return { locked: true, lockedAt: lockEvent.created_at }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? ''

  // --- バリデーション ---
  let body: z.infer<typeof loginSchema>
  try {
    const raw = await request.json()
    const parsed = loginSchema.safeParse(raw)
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message).join('; ')
      return NextResponse.json(
        { success: false, error: messages },
        { status: 400 },
      )
    }
    body = parsed.data
  } catch {
    return NextResponse.json(
      { success: false, error: 'リクエストの形式が不正です。' },
      { status: 400 },
    )
  }

  const { email, password } = body
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString()

  // --- Service client を 1 回だけ取得 ---
  const service = await getServiceClient()
  if (!service) {
    // DB 不可 → フェイルオープン（ブルートフォースチェックなしでログイン処理）
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !authData.user) {
      return NextResponse.json(
        { success: false, error: 'メールアドレスまたはパスワードが正しくありません。' },
        { status: 401 },
      )
    }
    const { data: athlete } = await supabase.from('athletes').select('id').eq('user_id', authData.user.id).maybeSingle()
    return NextResponse.json({ success: true, redirectTo: athlete ? '/home' : '/dashboard', user: { id: authData.user.id, email: authData.user.email, role: athlete ? 'athlete' : 'staff' } })
  }

  // --- IP レート制限 + アカウントロック確認を並列実行 ---
  const [ipAttempts, lockStatus] = await Promise.all([
    getIpAttempts(service, ip, windowStart),
    getLastLockEvent(service, email, windowStart),
  ])

  // --- IP ベースレート制限 ---
  if (ipAttempts >= MAX_IP_ATTEMPTS) {
    // fire-and-forget: イベント記録は待たない
    void recordAuthEvent(service, {
      email, ipAddress: ip, userAgent,
      eventType: 'login_failed',
      metadata: { reason: 'ip_rate_limit', ipAttempts },
    })

    return NextResponse.json(
      {
        success: false,
        error: 'ログイン試行回数の上限に達しました。しばらく時間をおいてから再度お試しください。',
        retryAfterSeconds: Math.ceil(LOCKOUT_WINDOW_MS / 1000),
      },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(LOCKOUT_WINDOW_MS / 1000)) } },
    )
  }

  // --- アカウントロック確認 ---
  if (lockStatus.locked && lockStatus.lockedAt) {
    const lockExpiry = new Date(new Date(lockStatus.lockedAt).getTime() + LOCKOUT_WINDOW_MS)
    const remainingMs = lockExpiry.getTime() - Date.now()
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))

    void recordAuthEvent(service, {
      email, ipAddress: ip, userAgent,
      eventType: 'login_failed',
      metadata: { reason: 'account_locked', remainingMinutes },
    })

    return NextResponse.json(
      {
        success: false,
        error: `アカウントが一時的にロックされています。${remainingMinutes}分後に再度お試しください。`,
        locked: true,
        remainingMinutes,
      },
      { status: 423 },
    )
  }

  // --- Supabase Auth でログイン ---
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // --- 認証失敗 ---
  if (authError || !authData.user) {
    const failedCount = await getFailedAttempts(service, email, windowStart)
    const newFailedCount = failedCount + 1
    const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - newFailedCount)

    // イベント記録（fire-and-forget）
    void recordAuthEvent(service, {
      email, ipAddress: ip, userAgent,
      eventType: 'login_failed',
      metadata: { reason: 'invalid_credentials', failedCount: newFailedCount, remainingAttempts },
    })

    // ロック閾値到達 → ロックイベント記録
    if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
      void recordAuthEvent(service, {
        email, ipAddress: ip, userAgent,
        eventType: 'account_locked',
        metadata: { failedCount: newFailedCount, lockDurationMinutes: LOCKOUT_WINDOW_MS / 60_000 },
      })

      return NextResponse.json(
        {
          success: false,
          error: `ログイン試行回数の上限（${MAX_FAILED_ATTEMPTS}回）に達したため、アカウントを一時的にロックしました。${LOCKOUT_WINDOW_MS / 60_000}分後に再度お試しください。`,
          locked: true,
          remainingMinutes: LOCKOUT_WINDOW_MS / 60_000,
        },
        { status: 423 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'メールアドレスまたはパスワードが正しくありません。',
        remainingAttempts,
      },
      { status: 401 },
    )
  }

  // --- 認証成功 ---
  void recordAuthEvent(service, {
    email, ipAddress: ip, userAgent,
    eventType: 'login_success',
    metadata: { userId: authData.user.id },
  })

  // ロール判定
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  const redirectTo = athlete ? '/home' : '/dashboard'

  return NextResponse.json({
    success: true,
    redirectTo,
    user: {
      id: authData.user.id,
      email: authData.user.email,
      role: athlete ? 'athlete' : 'staff',
    },
  })
}
