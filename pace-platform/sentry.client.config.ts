import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',

  // 本番: 10% サンプリング / 開発: 100%
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // PII マスキング
  beforeSend(event) {
    if (event.user) {
      if (event.user.email) event.user.email = '[REDACTED_EMAIL]'
      if (event.user.username) event.user.username = '[REDACTED_USERNAME]'
    }
    return event
  },

  // 開発環境ではコンソール出力を抑制
  debug: false,
})
