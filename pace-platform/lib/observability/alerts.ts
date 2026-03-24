/**
 * pace-platform/lib/observability/alerts.ts
 * ============================================================
 * PACE Platform — アラートルール & Slack 通知
 *
 * アラート定義:
 *   - エラーレート > 5%             → #alerts チャンネル (critical)
 *   - Gemini API レイテンシ > 10s   → #performance チャンネル (warning)
 *   - 月次コスト超過                → #costs チャンネル (critical)
 *   - Stripe Webhook 失敗           → #billing チャンネル (critical)
 *
 * 【防壁4】Slack 送信失敗はロガーに記録して処理を継続する
 * ============================================================
 */

import { createLogger } from './logger'

const log = createLogger('alerts')

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface AlertPayload {
  name: string
  severity: AlertSeverity
  message: string
  traceId?: string
  /** 推奨アクション */
  action?: string
  /** 任意の追加データ */
  data?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Slack Webhook 送信
// ---------------------------------------------------------------------------

/** Slack メッセージの色（severity 対応）*/
const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info:     '#36a64f',  // 緑
  warning:  '#ffaa00',  // 黄
  critical: '#ff0000',  // 赤
}

async function sendSlackNotification(
  webhookUrl: string,
  payload: AlertPayload,
): Promise<void> {
  const fields: Array<{ title: string; value: string; short: boolean }> = [
    { title: '重要度', value: payload.severity.toUpperCase(), short: true },
  ]

  if (payload.traceId) {
    fields.push({ title: 'Trace ID', value: payload.traceId.slice(0, 16) + '...', short: true })
  }
  if (payload.action) {
    fields.push({ title: '推奨アクション', value: payload.action, short: false })
  }
  if (payload.data) {
    for (const [k, v] of Object.entries(payload.data)) {
      fields.push({ title: k, value: String(v), short: true })
    }
  }

  const body = JSON.stringify({
    attachments: [{
      color:      SEVERITY_COLOR[payload.severity],
      title:      `[PACE Alert] ${payload.name}`,
      text:       payload.message,
      fields,
      footer:     'PACE Platform Observability',
      ts:         Math.floor(Date.now() / 1000),
    }],
  })

  const res = await fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!res.ok) {
    throw new Error(`Slack Webhook 送信失敗: HTTP ${res.status}`)
  }
}

// ---------------------------------------------------------------------------
// 汎用アラート発火関数
// ---------------------------------------------------------------------------

/**
 * アラートを発火する。
 * ログに記録し、対応する Slack チャンネルに通知する。
 *
 * 環境変数:
 *   SLACK_WEBHOOK_URL          — デフォルト (#alerts)
 *   SLACK_WEBHOOK_PERFORMANCE  — パフォーマンスアラート (#performance)
 *   SLACK_WEBHOOK_COSTS        — コストアラート (#costs)
 *   SLACK_WEBHOOK_BILLING      — Billing アラート (#billing)
 *
 * @param payload  アラート内容
 * @param channel  送信先チャンネル識別子
 */
export async function fireAlert(
  payload: AlertPayload,
  channel: 'alerts' | 'performance' | 'costs' | 'billing' = 'alerts',
): Promise<void> {
  // ログ記録（防壁4: Slack 送信前に必ずログに残す）
  const logLevel = payload.severity === 'critical' ? 'error'
    : payload.severity === 'warning' ? 'warn'
    : 'info'

  const traceExtra = payload.traceId !== undefined ? { traceId: payload.traceId } : {}

  log[logLevel](`アラート発火: ${payload.name}`, {
    ...traceExtra,
    data: {
      alertName: payload.name,
      severity:  payload.severity,
      channel,
      message:   payload.message,
      ...(payload.action !== undefined ? { action: payload.action } : {}),
      ...payload.data,
    },
  })

  // チャンネル別 Webhook URL 解決
  const webhookEnvMap: Record<typeof channel, string> = {
    alerts:      'SLACK_WEBHOOK_URL',
    performance: 'SLACK_WEBHOOK_PERFORMANCE',
    costs:       'SLACK_WEBHOOK_COSTS',
    billing:     'SLACK_WEBHOOK_BILLING',
  }
  const webhookKey = webhookEnvMap[channel]
  const webhookUrl = process.env[webhookKey] ?? process.env['SLACK_WEBHOOK_URL']

  if (!webhookUrl) {
    log.warn(`Slack Webhook URL が未設定（${webhookKey}）のため通知をスキップします`, {
      ...traceExtra,
      data: { requiredEnvVar: webhookKey },
    })
    return
  }

  try {
    await sendSlackNotification(webhookUrl, payload)
    log.info(`Slack 通知送信完了: ${payload.name}`, {
      ...traceExtra,
      data: { channel, severity: payload.severity },
    })
  } catch (err) {
    // Slack 送信失敗はリクエストをブロックしない（防壁4）
    log.errorFromException(`Slack 通知送信失敗: ${payload.name}`, err, traceExtra)
  }
}

// ---------------------------------------------------------------------------
// 定義済みアラートルール（呼び出しヘルパー）
// ---------------------------------------------------------------------------

/**
 * エラーレート急増アラート（> 5% / 5分間）。
 * API ルートやバックグラウンドジョブのエラー率集計後に呼び出す。
 *
 * 通知先: #alerts (critical)
 * アクション: Sentry で最新エラーを確認し、@04-backend / @07-ml-engineer に調査を依頼
 */
export async function alertErrorRateSpike(params: {
  errorRate: number
  windowMinutes: number
  traceId?: string
}): Promise<void> {
  if (params.errorRate <= 0.05) return  // 5% 以下は通知しない

  await fireAlert({
    name:     'エラー率急増',
    severity: 'critical',
    message:  `エラーレートが ${(params.errorRate * 100).toFixed(1)}% に達しました（直近 ${params.windowMinutes} 分）`,
    ...(params.traceId !== undefined ? { traceId: params.traceId } : {}),
    action:   'Sentry で最新エラーを確認し、@04-backend / @07-ml-engineer に調査を依頼',
    data: {
      errorRate:     `${(params.errorRate * 100).toFixed(1)}%`,
      windowMinutes: params.windowMinutes,
      threshold:     '5%',
    },
  }, 'alerts')
}

/**
 * Gemini API レイテンシ増大アラート（> 10秒）。
 * callGeminiWithRetry の duration が閾値を超えた場合に呼び出す。
 *
 * 通知先: #performance (warning)
 * アクション: @07-ml-engineer にレートリミット強化またはモデル変更を依頼
 */
export async function alertGeminiLatency(params: {
  endpoint:   string
  durationMs: number
  traceId?:   string
}): Promise<void> {
  const THRESHOLD_MS = 10_000

  if (params.durationMs <= THRESHOLD_MS) return

  await fireAlert({
    name:     'Gemini API レイテンシ増大',
    severity: 'warning',
    message:  `Gemini API (${params.endpoint}) のレイテンシが ${(params.durationMs / 1000).toFixed(1)}s に達しました`,
    ...(params.traceId !== undefined ? { traceId: params.traceId } : {}),
    action:   '@07-ml-engineer にレートリミット強化またはモデル変更を依頼',
    data: {
      endpoint:      params.endpoint,
      durationMs:    params.durationMs,
      thresholdMs:   THRESHOLD_MS,
    },
  }, 'performance')
}

/**
 * 月次コスト超過アラート（MONTHLY_LIMIT_EXCEEDED エラー）。
 * lib/gemini/client.ts の checkMonthlyCallLimit が MONTHLY_LIMIT_EXCEEDED を throw した際に呼び出す。
 *
 * 通知先: #costs (critical)
 * アクション: @07-ml-engineer にレートリミット強化を依頼
 */
export async function alertMonthlyCostExceeded(params: {
  userId:   string
  endpoint: string
  traceId?: string
}): Promise<void> {
  await fireAlert({
    name:     'AI API 月次コスト超過',
    severity: 'critical',
    message:  `ユーザー ${params.userId} が月次 Gemini API コール上限を超過しました（エンドポイント: ${params.endpoint}）`,
    ...(params.traceId !== undefined ? { traceId: params.traceId } : {}),
    action:   '@07-ml-engineer にレートリミット強化を依頼',
    data: {
      userId:   params.userId,
      endpoint: params.endpoint,
    },
  }, 'costs')
}

/**
 * Stripe Webhook 失敗アラート。
 * lib/billing/webhook-handler.ts のエラーハンドラーから呼び出す。
 *
 * 通知先: #billing (critical)
 * アクション: @04-backend に Stripe ダッシュボードでの Webhook ログ確認を依頼
 */
export async function alertStripeWebhookFailure(params: {
  eventType:    string
  stripeEventId?: string
  errorMessage: string
  traceId?:     string
}): Promise<void> {
  await fireAlert({
    name:     'Stripe Webhook 失敗',
    severity: 'critical',
    message:  `Stripe Webhook の処理に失敗しました: ${params.eventType}`,
    ...(params.traceId !== undefined ? { traceId: params.traceId } : {}),
    action:   '@04-backend に Stripe ダッシュボードでの Webhook ログ確認を依頼',
    data: {
      eventType:    params.eventType,
      stripeEventId: params.stripeEventId ?? '(不明)',
      errorMessage: params.errorMessage,
    },
  }, 'billing')
}

// ---------------------------------------------------------------------------
// アラートルール一覧（ドキュメント用）
// ---------------------------------------------------------------------------

export const ALERT_RULES = [
  {
    name:      'エラー率急増',
    condition: 'Error rate > 5% for 5 minutes',
    severity:  'critical' as AlertSeverity,
    notify:    ['Slack #alerts'],
    action:    'Sentry で最新エラーを確認し、@04-backend / @07-ml-engineer に調査を依頼',
    fn:        alertErrorRateSpike,
  },
  {
    name:      'Gemini API レイテンシ増大',
    condition: 'Gemini API latency > 10,000ms',
    severity:  'warning' as AlertSeverity,
    notify:    ['Slack #performance'],
    action:    '@07-ml-engineer にレートリミット強化またはモデル変更を依頼',
    fn:        alertGeminiLatency,
  },
  {
    name:      'AI API 月次コスト超過',
    condition: 'Monthly Gemini API call count >= GEMINI_MONTHLY_CALL_LIMIT',
    severity:  'critical' as AlertSeverity,
    notify:    ['Slack #costs'],
    action:    '@07-ml-engineer にレートリミット強化を依頼',
    fn:        alertMonthlyCostExceeded,
  },
  {
    name:      'Stripe Webhook 失敗',
    condition: 'Stripe Webhook handler throws an error',
    severity:  'critical' as AlertSeverity,
    notify:    ['Slack #billing'],
    action:    '@04-backend に Stripe ダッシュボードでの Webhook ログ確認を依頼',
    fn:        alertStripeWebhookFailure,
  },
] as const
