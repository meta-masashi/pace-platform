import * as Sentry from '@sentry/nextjs'

Sentry.init({
  ...(process.env.NEXT_PUBLIC_SENTRY_DSN ? { dsn: process.env.NEXT_PUBLIC_SENTRY_DSN } : {}),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',

  // 本番: 10% サンプリング / 開発: 100%
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // PII マスキング（lib/observability/sentry.ts の sanitizeSentryEvent 相当をインライン実装）
  beforeSend(event) {
    // ユーザー情報マスキング
    if (event.user) {
      if (event.user.email) event.user.email = '[REDACTED_EMAIL]'
      if (event.user.username) event.user.username = '[REDACTED_USERNAME]'
    }

    // リクエストヘッダーマスキング
    if (event.request?.headers) {
      const h = event.request.headers as Record<string, string>
      if (h['authorization']) h['authorization'] = '[REDACTED]'
      if (h['cookie']) h['cookie'] = '[REDACTED]'
    }

    // リクエストボディの機密フィールドマスキング
    if (event.request?.data && typeof event.request.data === 'object') {
      const sensitiveKeys = /^(password|token|secret|creditcard|credit_card)$/i
      const body = event.request.data as Record<string, unknown>
      for (const key of Object.keys(body)) {
        if (sensitiveKeys.test(key)) {
          body[key] = '[REDACTED]'
        }
      }
    }

    // 例外メッセージ内のメールアドレスパターンをマスキング
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value) {
          ex.value = ex.value.replace(emailRegex, '[REDACTED_EMAIL]')
        }
      }
    }

    return event
  },

  // 開発環境ではコンソール出力を抑制
  debug: false,
})
