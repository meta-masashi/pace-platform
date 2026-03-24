/**
 * pace-platform/lib/observability/sentry.ts
 * ============================================================
 * PACE Platform — Sentry エラートラッキング
 *
 * 仕様:
 *   - @sentry/nextjs SDK の初期化ラッパー
 *   - beforeSend フックで PII を除去（防壁2）
 *   - Trace ID を Sentry タグに伝播（spanId 連携）
 *   - 環境別サンプリングレート: production=0.1 / staging=1.0
 *   - 環境変数: SENTRY_DSN, SENTRY_ENVIRONMENT
 *
 * 使用例:
 *   // Next.js プロジェクトの sentry.client.config.ts から呼び出す
 *   import { initSentryClient } from '@/lib/observability/sentry'
 *   initSentryClient()
 * ============================================================
 */

import { maskPii } from './logger'

// ---------------------------------------------------------------------------
// 型定義（@sentry/nextjs の型を最小限でインライン定義）
// NOTE: @sentry/nextjs はアプリケーション層でインストールするため、
//       この lib パッケージでは型のみ参照し runtime import は dynamic にする
// ---------------------------------------------------------------------------

interface SentryUser {
  email?: string
  username?: string
  id?: string
}

interface SentryRequest {
  data?: string | Record<string, unknown>
  headers?: Record<string, string>
  cookies?: string | Record<string, string>
}

interface SentryEvent {
  user?: SentryUser
  request?: SentryRequest
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  exception?: {
    values?: Array<{
      value?: string
      stacktrace?: { frames?: Array<{ vars?: Record<string, unknown> }> }
    }>
  }
}

// ---------------------------------------------------------------------------
// PII マスキング処理（防壁2）
// ---------------------------------------------------------------------------

/**
 * Sentry イベントから PII を除去する。
 * beforeSend フックに渡す純粋関数として実装（テスト容易性のため export）。
 */
export function sanitizeSentryEvent(event: SentryEvent): SentryEvent {
  // ユーザー情報: email / username を REDACTED に
  if (event.user) {
    if (event.user.email)    event.user.email    = '[REDACTED_EMAIL]'
    if (event.user.username) event.user.username = '[REDACTED_USERNAME]'
    // id（内部 UUID）は保持する
  }

  // リクエストボディ: password / creditCard / cardNumber / ssn を削除
  if (event.request?.data) {
    const raw = event.request.data
    let body: Record<string, unknown> = {}
    try {
      body = typeof raw === 'string' ? JSON.parse(raw) : { ...raw }
    } catch {
      // JSON パース不可の場合は body を空にしてフォールスルー
    }

    const PII_KEYS = ['password', 'passwd', 'creditCard', 'credit_card', 'cardNumber',
                      'card_number', 'cvv', 'ssn', 'myNumber', 'my_number', 'secret', 'token']
    for (const key of PII_KEYS) {
      if (key in body) body[key] = '[REDACTED]'
    }
    event.request.data = JSON.stringify(body)
  }

  // リクエストヘッダー: Authorization / Cookie を REDACTED に
  if (event.request?.headers) {
    const h = event.request.headers
    if (h['authorization'] !== undefined) h['authorization'] = '[REDACTED]'
    if (h['cookie'] !== undefined)        h['cookie']        = '[REDACTED]'
  }

  // Cookie 文字列
  if (event.request?.cookies && typeof event.request.cookies === 'string') {
    event.request.cookies = '[REDACTED]'
  }

  // 例外メッセージ内の PII マスク（メールアドレス等がスタックトレースに混入するケース）
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = maskPii(ex.value)

      // ローカル変数（vars）から PII キーを除去
      if (ex.stacktrace?.frames) {
        for (const frame of ex.stacktrace.frames) {
          if (frame.vars) {
            for (const varKey of Object.keys(frame.vars)) {
              if (/email|phone|name|password|token|secret/i.test(varKey)) {
                frame.vars[varKey] = '[REDACTED]'
              }
            }
          }
        }
      }
    }
  }

  return event
}

// ---------------------------------------------------------------------------
// サンプリングレート
// ---------------------------------------------------------------------------

function resolveTracesSampleRate(): number {
  const env = process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development'
  if (env === 'production') return 0.1
  if (env === 'staging')    return 1.0
  return 1.0 // development / test
}

// ---------------------------------------------------------------------------
// Sentry 初期化（クライアントサイド）
// ---------------------------------------------------------------------------

/**
 * Sentry クライアントサイド初期化。
 * Next.js の `sentry.client.config.ts` から呼び出す。
 *
 * 環境変数:
 *   NEXT_PUBLIC_SENTRY_DSN   — Sentry DSN
 *   SENTRY_ENVIRONMENT       — 環境名（省略時は NODE_ENV）
 */
export async function initSentryClient(): Promise<void> {
  const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN']
  if (!dsn) {
    console.warn('[sentry] NEXT_PUBLIC_SENTRY_DSN が未設定のため Sentry を初期化しません')
    return
  }

  // @sentry/nextjs はアプリケーション層の依存のため dynamic import
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Sentry: any = await (import('@sentry/nextjs' as string) as Promise<unknown>).catch(() => null)
  if (!Sentry) {
    console.warn('[sentry] @sentry/nextjs が見つかりません。npm install @sentry/nextjs を実行してください')
    return
  }

  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: resolveTracesSampleRate(),

    beforeSend(event: SentryEvent) {
      return sanitizeSentryEvent(event)
    },

    // ソースマップを本番でもアップロードする場合は Sentry CLI / Vite プラグインを使用
    // パフォーマンス計測の統合（Web Vitals と連携）
    integrations: [],
  })
}

// ---------------------------------------------------------------------------
// Sentry 初期化（サーバーサイド / Edge Function）
// ---------------------------------------------------------------------------

/**
 * Sentry サーバーサイド初期化。
 * Next.js の `sentry.server.config.ts` または Edge Function から呼び出す。
 */
export async function initSentryServer(): Promise<void> {
  const dsn = process.env['SENTRY_DSN'] ?? process.env['NEXT_PUBLIC_SENTRY_DSN']
  if (!dsn) {
    console.warn('[sentry] SENTRY_DSN が未設定のため Sentry（server）を初期化しません')
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Sentry: any = await (import('@sentry/nextjs' as string) as Promise<unknown>).catch(() => null)
  if (!Sentry) return

  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: resolveTracesSampleRate(),

    beforeSend(event: SentryEvent) {
      return sanitizeSentryEvent(event)
    },
  })
}

// ---------------------------------------------------------------------------
// Trace ID を Sentry スコープにセット
// ---------------------------------------------------------------------------

/**
 * 現在の Sentry スコープに Trace ID タグを付与する。
 * リクエストハンドラーの冒頭で呼び出すことで、
 * エラーレポートに traceId が記録される。
 */
export async function setSentryTraceTag(traceId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Sentry: any = await (import('@sentry/nextjs' as string) as Promise<unknown>).catch(() => null)
  if (!Sentry) return
  Sentry.setTag('traceId', traceId)
}

/**
 * エラーを Sentry に手動でキャプチャする。
 * traceId が渡された場合はタグに付与する。
 */
export async function captureSentryException(
  err: unknown,
  context?: { traceId?: string; userId?: string; data?: Record<string, unknown> },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Sentry: any = await (import('@sentry/nextjs' as string) as Promise<unknown>).catch(() => null)
  if (!Sentry) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sentry.withScope((scope: any) => {
    if (context?.traceId) scope.setTag('traceId', context.traceId)
    // userId は内部 UUID のみ許可（PII 禁止）
    if (context?.userId) scope.setUser({ id: context.userId })
    if (context?.data)   scope.setExtras(context.data as Record<string, unknown>)
    Sentry.captureException(err)
  })
}
