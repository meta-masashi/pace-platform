/**
 * pace-platform/lib/observability/tracer.ts
 * ============================================================
 * PACE Platform — 分散トレーシング
 *
 * 仕様:
 *   - Trace ID 生成（crypto.randomUUID()）
 *   - スパン管理（開始・終了・エラー記録）
 *   - Gemini API 呼び出しの自動トレース
 *   - Supabase クエリの自動トレース
 *   - X-Trace-Id ヘッダーへの伝播
 *   - Supabase api_traces テーブルへの非同期書き込み（ベストエフォート）
 * ============================================================
 */

import { createLogger } from './logger'

const log = createLogger('tracer')

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type SpanStatus = 'ok' | 'error'

export interface Span {
  traceId: string
  spanId: string
  /** 親スパン ID（ルートスパンの場合は undefined）*/
  parentSpanId?: string
  /** 操作名（例: 'gemini.generateContent', 'supabase.select'）*/
  operation: string
  /** サービス名 */
  service: string
  startedAt: string   // ISO 8601 UTC
  endedAt?: string
  durationMs?: number
  status: SpanStatus
  /** エラー情報（status='error' 時）*/
  errorMessage?: string
  /** 任意メタデータ */
  attributes?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Supabase への非同期書き込み（防壁4: 失敗してもリクエストをブロックしない）
// ---------------------------------------------------------------------------

async function persistSpan(span: Span): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) return

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(url, key, { auth: { persistSession: false } })

    await supabase.from('api_traces').insert({
      trace_id:       span.traceId,
      span_id:        span.spanId,
      parent_span_id: span.parentSpanId ?? null,
      operation:      span.operation,
      service:        span.service,
      started_at:     span.startedAt,
      ended_at:       span.endedAt ?? null,
      duration_ms:    span.durationMs ?? null,
      status:         span.status,
      error_message:  span.errorMessage ?? null,
      attributes:     span.attributes ?? null,
    })
  } catch {
    // DB 書き込み失敗はサイレントに無視（防壁4）
  }
}

// ---------------------------------------------------------------------------
// Tracer クラス
// ---------------------------------------------------------------------------

export class Tracer {
  private readonly service: string

  constructor(service: string) {
    this.service = service
  }

  /**
   * 新しいルート Trace ID を生成する。
   * リクエスト受信時やバックグラウンドジョブ開始時に呼び出す。
   */
  newTraceId(): string {
    return crypto.randomUUID()
  }

  /**
   * スパンを開始し、処理完了後に自動で終了・記録する。
   *
   * @param operation  操作名（例: 'gemini.generateContent'）
   * @param traceId    親 Trace ID
   * @param fn         計測対象の非同期処理
   * @param opts       任意オプション（parentSpanId / attributes）
   */
  async withSpan<T>(
    operation: string,
    traceId: string,
    fn: (span: Span) => Promise<T>,
    opts?: {
      parentSpanId?: string
      attributes?: Record<string, unknown>
    },
  ): Promise<T> {
    const span: Span = {
      traceId,
      spanId:    crypto.randomUUID(),
      operation,
      service:   this.service,
      startedAt: new Date().toISOString(),
      status:    'ok',
      ...(opts?.parentSpanId !== undefined ? { parentSpanId: opts.parentSpanId } : {}),
      ...(opts?.attributes   !== undefined ? { attributes:   opts.attributes   } : {}),
    }

    const startMs = Date.now()

    try {
      const result = await fn(span)

      span.status    = 'ok'
      span.endedAt   = new Date().toISOString()
      span.durationMs = Date.now() - startMs

      log.info(`スパン完了: ${operation}`, {
        traceId,
        duration: span.durationMs,
        data: { spanId: span.spanId, operation, status: 'ok' },
      })

      // 非同期で永続化（await しない → リクエストをブロックしない）
      void persistSpan(span)

      return result
    } catch (err) {
      span.status       = 'error'
      span.endedAt      = new Date().toISOString()
      span.durationMs   = Date.now() - startMs
      span.errorMessage = err instanceof Error ? err.message : String(err)

      const errorField =
        err instanceof Error
          ? {
              name: err.name,
              message: err.message,
              ...(err.stack !== undefined ? { stack: err.stack } : {}),
            }
          : { name: 'UnknownError', message: String(err) }

      log.error(`スパンエラー: ${operation}`, {
        traceId,
        duration: span.durationMs,
        error: errorField,
        data: { spanId: span.spanId, operation },
      })

      void persistSpan(span)

      throw err
    }
  }
}

// ---------------------------------------------------------------------------
// デフォルトインスタンス & ファクトリ
// ---------------------------------------------------------------------------

export const tracer = new Tracer('pace-platform')

export function createTracer(service: string): Tracer {
  return new Tracer(service)
}

// ---------------------------------------------------------------------------
// Gemini API 自動トレースラッパー
// ---------------------------------------------------------------------------

/**
 * Gemini API 呼び出しをトレース付きで実行する。
 * lib/gemini/client.ts の callGeminiWithRetry を呼び出す前にラップして使用する。
 *
 * @example
 * const result = await traceGeminiCall(
 *   'rehab-generator',
 *   traceId,
 *   () => callGeminiWithRetry(prompt, parser, context),
 *   { model: 'gemini-2.0-flash', inputChars: prompt.length }
 * )
 */
export async function traceGeminiCall<T>(
  endpoint: string,
  traceId: string,
  fn: () => Promise<T>,
  attributes?: Record<string, unknown>,
): Promise<T> {
  return tracer.withSpan(
    `gemini.${endpoint}`,
    traceId,
    () => fn(),
    attributes !== undefined ? { attributes } : undefined,
  )
}

// ---------------------------------------------------------------------------
// Supabase クエリ自動トレースラッパー
// ---------------------------------------------------------------------------

/**
 * Supabase クエリをトレース付きで実行する。
 *
 * @example
 * const data = await traceSupabaseQuery(
 *   'select',
 *   'assessments',
 *   traceId,
 *   () => supabase.from('assessments').select('*').eq('athlete_id', id)
 * )
 */
export async function traceSupabaseQuery<T>(
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'rpc',
  table: string,
  traceId: string,
  fn: () => Promise<{ data: T; error: unknown }>,
): Promise<{ data: T; error: unknown }> {
  return tracer.withSpan(
    `supabase.${operation}.${table}`,
    traceId,
    async () => {
      const res = await fn()
      if (res.error) {
        const errMsg = res.error instanceof Error
          ? res.error.message
          : JSON.stringify(res.error)
        throw new Error(`Supabase ${operation} ${table}: ${errMsg}`)
      }
      return res
    },
    { attributes: { operation, table } },
  )
}

// ---------------------------------------------------------------------------
// HTTP ヘッダー ユーティリティ
// ---------------------------------------------------------------------------

/**
 * リクエストヘッダーから Trace ID を取得する。
 * ヘッダーが存在しない場合は新しい UUID を生成する。
 *
 * バックエンド（Edge Function / API Route）の冒頭で呼び出す。
 */
export function getTraceIdFromRequest(req: Request): string {
  return req.headers.get('X-Trace-Id') ?? crypto.randomUUID()
}

/**
 * 既存の fetch オプションに X-Trace-Id ヘッダーを付与して返す。
 */
export function withTraceHeader(
  traceId: string,
  options: RequestInit = {},
): RequestInit {
  return {
    ...options,
    headers: {
      ...options.headers,
      'X-Trace-Id': traceId,
    },
  }
}

/**
 * Trace ID を伝播させる fetch ラッパー。
 * 全ての外部 API 呼び出し（Gemini / Dify / Stripe 等）に使用する。
 */
export async function tracedFetch(
  url: string,
  traceId: string,
  options: RequestInit = {},
): Promise<Response> {
  return tracer.withSpan(
    `http.${options.method ?? 'GET'}.${new URL(url).hostname}`,
    traceId,
    async () => {
      const res = await fetch(url, withTraceHeader(traceId, options))
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`)
      }
      return res
    },
    { attributes: { url, method: options.method ?? 'GET' } },
  )
}
