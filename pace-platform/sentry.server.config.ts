import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
Sentry.init({
  ...(dsn && { dsn }),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  beforeSend(event) {
    if (event.user) {
      if (event.user.email) event.user.email = '[REDACTED_EMAIL]'
      if (event.user.username) event.user.username = '[REDACTED_USERNAME]'
    }
    if (event.request?.headers) {
      const h = event.request.headers as Record<string, string>
      if (h['authorization']) h['authorization'] = '[REDACTED]'
      if (h['cookie']) h['cookie'] = '[REDACTED]'
    }
    return event
  },

  debug: false,
})
