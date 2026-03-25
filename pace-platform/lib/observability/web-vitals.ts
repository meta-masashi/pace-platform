/**
 * pace-platform/lib/observability/web-vitals.ts
 * ============================================================
 * PACE Platform — Core Web Vitals 計測
 *
 * 仕様:
 *   - web-vitals ライブラリを使用（LCP / FID / CLS / TTFB / FCP）
 *   - GA4 への自動送信（navigator.sendBeacon）
 *   - Supabase web_vitals_log テーブルへの記録
 *   - 閾値超過時にロガーで warn を出力
 *
 * 使用例（Next.js の app/layout.tsx や _app.tsx）:
 *   import { initWebVitals } from '@/lib/observability/web-vitals'
 *   // クライアントコンポーネントの useEffect 内で呼び出す
 *   useEffect(() => { initWebVitals(sessionTraceId) }, [])
 * ============================================================
 */

import { createLogger } from './logger'

const log = createLogger('web-vitals')

// DOM API へのアクセスは globalThis 経由で行い、lib: ES2022 の型制約を回避する
/* eslint-disable @typescript-eslint/no-explicit-any */
const _window:      any = typeof globalThis !== 'undefined' ? (globalThis as any)['window']      : undefined
const _navigator:   any = typeof globalThis !== 'undefined' ? (globalThis as any)['navigator']   : undefined
const _sessionStorage: any = typeof globalThis !== 'undefined' ? (globalThis as any)['sessionStorage'] : undefined
/* eslint-enable @typescript-eslint/no-explicit-any */

/** ブラウザ環境かどうかを判定する */
function isBrowser(): boolean {
  return _window !== undefined
}

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type VitalName = 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'FCP' | 'INP'

export interface VitalMetric {
  name: VitalName
  value: number
  /** web-vitals ライブラリが付与する一意 ID */
  id: string
  /** 'good' | 'needs-improvement' | 'poor' の評価 */
  rating?: string
  navigationType?: string
}

// ---------------------------------------------------------------------------
// 閾値（Google 推奨値）
// ---------------------------------------------------------------------------

const THRESHOLDS: Partial<Record<VitalName, number>> = {
  LCP:  2500,   // ms
  FID:  100,    // ms
  INP:  200,    // ms
  CLS:  0.1,    // スコア（単位なし）
  FCP:  1800,   // ms
  TTFB: 800,    // ms
}

// ---------------------------------------------------------------------------
// GA4 への送信
// ---------------------------------------------------------------------------

function sendToGA4(metric: VitalMetric): void {
  const measurementId = process.env['NEXT_PUBLIC_GA4_MEASUREMENT_ID']
    ?? (_window?.['__GA4_MEASUREMENT_ID'] as string | undefined)

  if (!measurementId || !_navigator?.sendBeacon) return

  const body = JSON.stringify({
    client_id: getOrCreateClientId(),
    events: [{
      name: 'web_vitals',
      params: {
        metric_name:   metric.name,
        metric_value:  Math.round(metric.value * 1000) / 1000,
        metric_id:     metric.id,
        metric_rating: metric.rating ?? 'unknown',
      },
    }],
  })

  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${process.env['GA4_API_SECRET'] ?? ''}`

  _navigator.sendBeacon(endpoint, body)
}

/** ブラウザセッション内で一意のクライアント ID を生成・キャッシュする */
function getOrCreateClientId(): string {
  if (!isBrowser()) return 'ssr'
  const key = '__pace_cid'
  const existing = _sessionStorage?.getItem(key) as string | null
  if (existing) return existing
  const id = crypto.randomUUID()
  _sessionStorage?.setItem(key, id)
  return id
}

// ---------------------------------------------------------------------------
// Supabase への記録
// ---------------------------------------------------------------------------

async function persistToSupabase(metric: VitalMetric, traceId: string): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  if (!url || !key) return

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(url, key)

    await supabase.from('web_vitals_log').insert({
      trace_id:        traceId,
      metric_name:     metric.name,
      metric_value:    metric.value,
      metric_id:       metric.id,
      rating:          metric.rating ?? null,
      navigation_type: metric.navigationType ?? null,
      page_url:        isBrowser() ? (_window?.location?.pathname as string | undefined) ?? null : null,
      recorded_at:     new Date().toISOString(),
    })
  } catch {
    // 書き込み失敗はサイレントに無視（防壁4）
  }
}

// ---------------------------------------------------------------------------
// メトリクス受信ハンドラー
// ---------------------------------------------------------------------------

function handleMetric(metric: VitalMetric, traceId: string): void {
  const threshold = THRESHOLDS[metric.name]

  log.info(`Web Vital: ${metric.name}`, {
    traceId,
    data: {
      metric: metric.name,
      value:  Math.round(metric.value * 1000) / 1000,
      id:     metric.id,
      rating: metric.rating,
    },
  })

  // 閾値超過アラート
  if (threshold !== undefined && metric.value > threshold) {
    log.warn(`${metric.name} が目標値を超えました`, {
      traceId,
      data: {
        metric:    metric.name,
        actual:    metric.value,
        threshold,
        // @13-growth にパフォーマンス最適化を依頼するトリガー
        action:    '@13-growth を呼び出してパフォーマンス最適化を依頼します',
      },
    })
  }

  // GA4 に送信（ベストエフォート）
  sendToGA4(metric)

  // Supabase に記録（非同期・ベストエフォート）
  void persistToSupabase(metric, traceId)
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * Core Web Vitals の計測を開始する。
 * クライアントサイドでのみ呼び出すこと（SSR 環境では no-op）。
 *
 * @param traceId  ページセッションに紐付く Trace ID
 */
export async function initWebVitals(traceId: string): Promise<void> {
  if (!isBrowser()) return

  // web-vitals はクライアントサイドのみで動作する
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wv: any = await (import('web-vitals' as string) as Promise<unknown>).catch(() => null)
  if (!wv) {
    log.warn('web-vitals パッケージが見つかりません。npm install web-vitals を実行してください', { traceId })
    return
  }

  const handler = (metric: VitalMetric) => handleMetric(metric, traceId)

  if (typeof wv.onCLS  === 'function') wv.onCLS(handler)
  if (typeof wv.onFCP  === 'function') wv.onFCP(handler)
  if (typeof wv.onLCP  === 'function') wv.onLCP(handler)
  if (typeof wv.onTTFB === 'function') wv.onTTFB(handler)
  // FID は web-vitals v4 で INP に統合されたが後方互換のため両方登録
  if (typeof wv.onFID  === 'function') wv.onFID(handler)
  if (typeof wv.onINP  === 'function') wv.onINP(handler)

  log.info('Core Web Vitals 計測を開始しました', { traceId })
}
