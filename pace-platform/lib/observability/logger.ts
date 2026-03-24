/**
 * pace-platform/lib/observability/logger.ts
 * ============================================================
 * PACE Platform — 構造化 JSON ロギング
 *
 * 仕様:
 *   - pino ライクな構造化 JSON ログ（production）
 *   - ログレベル: debug / info / warn / error
 *   - 必須フィールド: timestamp / level / service / traceId / userId
 *   - PII マスキング: メールアドレス・氏名・電話番号を自動マスク
 *   - 環境変数 LOG_LEVEL（デフォルト: info）
 *   - 【防壁2】 PII は絶対にログに残さない
 * ============================================================
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  /** ISO 8601 UTC タイムスタンプ */
  timestamp: string
  level: LogLevel
  /** サービス識別子: 'frontend' | 'backend' | 'ai-pipeline' | 'billing' */
  service: string
  traceId: string
  /** ユーザー ID（内部 UUID のみ。メールアドレス等 PII 禁止）*/
  userId?: string
  message: string
  data?: Record<string, unknown>
  error?: { name: string; message: string; stack?: string }
  /** 処理時間（ms）*/
  duration?: number
}

// ---------------------------------------------------------------------------
// ログレベル数値マップ（フィルタリング用）
// ---------------------------------------------------------------------------

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function resolveMinLevel(): LogLevel {
  const raw = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase()
  if (raw in LEVEL_RANK) return raw as LogLevel
  return 'info'
}

// ---------------------------------------------------------------------------
// PII マスキング（防壁2）
// ---------------------------------------------------------------------------

const EMAIL_RE    = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
const PHONE_RE    = /(\+?81[-\s]?|0)(\d{1,4})[-\s]?(\d{2,4})[-\s]?(\d{3,4})/g
// 日本人氏名パターン（姓名スペース区切り / 全角カナ含む）
const JP_NAME_RE  = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]{2,5}[\s\u3000][\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]{1,5}/g

/**
 * 文字列中の PII をマスクする。
 * メール・電話番号・日本語氏名をそれぞれ [REDACTED_EMAIL] 等に置換。
 */
export function maskPii(value: string): string {
  return value
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]')
    .replace(JP_NAME_RE, '[REDACTED_NAME]')
}

/**
 * オブジェクトを再帰的にトラバースし、文字列フィールドの PII をマスクする。
 * depth > 8 で打ち切り（循環参照・深いネスト対策）。
 */
export function maskPiiDeep(obj: unknown, depth = 0): unknown {
  if (depth > 8) return obj
  if (typeof obj === 'string') return maskPii(obj)
  if (Array.isArray(obj)) return obj.map((v) => maskPiiDeep(v, depth + 1))
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // キー名が PII 的な場合は値ごと REDACTED
      if (/^(password|passwd|secret|token|credit_?card|card_?number|cvv|ssn|my_?number)$/i.test(k)) {
        result[k] = '[REDACTED]'
      } else {
        result[k] = maskPiiDeep(v, depth + 1)
      }
    }
    return result
  }
  return obj
}

// ---------------------------------------------------------------------------
// Logger クラス
// ---------------------------------------------------------------------------

export class Logger {
  private readonly service: string
  private readonly minLevel: LogLevel

  constructor(service: string, minLevel?: LogLevel) {
    this.service = service
    this.minLevel = minLevel ?? resolveMinLevel()
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[this.minLevel]
  }

  private buildEntry(
    level: LogLevel,
    message: string,
    extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'message'>>,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      traceId: extra?.traceId ?? crypto.randomUUID(),
      message: maskPii(message),
    }

    if (extra?.userId !== undefined) entry.userId = extra.userId
    if (extra?.duration !== undefined) entry.duration = extra.duration

    if (extra?.data !== undefined) {
      entry.data = maskPiiDeep(extra.data) as Record<string, unknown>
    }

    if (extra?.error !== undefined) {
      entry.error = {
        name: extra.error.name,
        message: maskPii(extra.error.message),
        // スタックトレースはログには含めるが、PII マスクを通す
        ...(extra.error.stack ? { stack: maskPii(extra.error.stack) } : {}),
      }
    }

    return entry
  }

  private emit(entry: LogEntry): void {
    if (process.env['NODE_ENV'] === 'production') {
      // production: 改行なし JSON（ログ集計システムがパースしやすい形式）
      console.log(JSON.stringify(entry))
    } else {
      // development / test: 人が読みやすい形式
      const prefix = `[${entry.level.toUpperCase()}] ${entry.service} (${entry.traceId.slice(0, 8)})`
      const extras: unknown[] = []
      if (entry.data) extras.push(entry.data)
      if (entry.error) extras.push(entry.error)
      if (entry.duration !== undefined) extras.push({ duration: `${entry.duration}ms` })

      switch (entry.level) {
        case 'error': console.error(prefix, entry.message, ...extras); break
        case 'warn':  console.warn(prefix, entry.message, ...extras);  break
        default:      console.log(prefix, entry.message, ...extras);   break
      }
    }
  }

  private log(
    level: LogLevel,
    message: string,
    extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'message'>>,
  ): void {
    if (!this.shouldLog(level)) return
    this.emit(this.buildEntry(level, message, extra))
  }

  debug(msg: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'message'>>): void {
    this.log('debug', msg, extra)
  }

  info(msg: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'message'>>): void {
    this.log('info', msg, extra)
  }

  warn(msg: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'message'>>): void {
    this.log('warn', msg, extra)
  }

  error(msg: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'message'>>): void {
    this.log('error', msg, extra)
  }

  /** Error オブジェクトを構造化して error ログを出す便利メソッド */
  errorFromException(
    msg: string,
    err: unknown,
    extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'message' | 'error'>>,
  ): void {
    const errorField: LogEntry['error'] =
      err instanceof Error
        ? {
            name: err.name,
            message: err.message,
            ...(err.stack !== undefined ? { stack: err.stack } : {}),
          }
        : { name: 'UnknownError', message: String(err) }
    this.log('error', msg, { ...extra, error: errorField })
  }
}

// ---------------------------------------------------------------------------
// シングルトン & ファクトリ
// ---------------------------------------------------------------------------

/** デフォルトロガー（service='app'） */
export const logger = new Logger('app')

/** サービス別ロガーを生成するファクトリ */
export function createLogger(service: string, minLevel?: LogLevel): Logger {
  return new Logger(service, minLevel)
}
