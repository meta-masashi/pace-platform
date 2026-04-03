/**
 * lib/api/handler.ts
 * ============================================================
 * PACE Platform — 統一 API ルートハンドラー
 *
 * 全 API route で使用する `withApiHandler()` ラッパー。
 * 以下を自動化:
 *   1. Trace ID 付与 (X-Trace-Id ヘッダー or 自動生成)
 *   2. 構造化ログ (開始/終了/エラー)
 *   3. Sentry 連携 (エラー自動キャプチャ)
 *   4. レスポンスへの traceId 付与
 *   5. 統一エラーレスポンス形式
 *   6. 分散トレーシング (tracer.withSpan 統合)
 *   7. リクエストボディサイズ制限
 *
 * 使用例:
 *   export const GET = withApiHandler(async (req, { log, traceId }) => {
 *     const data = await fetchSomething();
 *     return { data };
 *   }, { service: 'conditioning' });
 * ============================================================
 */

import { NextResponse } from 'next/server';
import { createLogger, type LogLevel } from '@/lib/observability/logger';
import { getTraceIdFromRequest, createTracer } from '@/lib/observability/tracer';
import { captureSentryException, setSentryTraceTag } from '@/lib/observability/sentry';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** デフォルトのリクエストボディサイズ上限 (1 MB) */
const DEFAULT_MAX_BODY_SIZE = 1_048_576;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** ハンドラーに渡されるコンテキスト */
export interface ApiContext {
  /** このリクエストの Trace ID */
  traceId: string;
  /** サービス名付きの構造化ロガー */
  log: ApiLogger;
  /** 認証済みユーザー ID（ハンドラー内で set 可能） */
  userId?: string;
  /** ルートパラメータ（Next.js dynamic route の [param] 値） */
  params: Record<string, string>;
}

/** ハンドラー内で使える簡易ロガー（traceId 自動付与） */
export interface ApiLogger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/** withApiHandler のオプション */
export interface ApiHandlerOptions {
  /** サービス名（ログの service フィールド） */
  service?: string;
  /** 最小ログレベル */
  logLevel?: LogLevel;
  /** Sentry にエラーを送信するか（デフォルト: true） */
  captureErrors?: boolean;
  /** レスポンスに X-Trace-Id を付与するか（デフォルト: true） */
  exposeTraceId?: boolean;
  /** リクエストボディの最大サイズ（バイト単位、デフォルト: 1_048_576 = 1MB） */
  maxBodySize?: number;
}

/**
 * API エラーのレスポンス型。
 * フロントエンドが `success: false` + `error` + `traceId` で判別可能。
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  traceId: string;
}

/**
 * ハンドラーが投げられる型付きエラー。
 * status と userMessage を指定すると withApiHandler が適切にレスポンスする。
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly userMessage: string,
    public readonly internalMessage?: string,
  ) {
    super(internalMessage ?? userMessage);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// ハンドラー型
// ---------------------------------------------------------------------------

/**
 * API ハンドラー関数の型。
 * - NextResponse を直接返す場合はそのまま返される
 * - オブジェクトを返す場合は { success: true, data: ... } でラップ
 * - ApiError を throw すると該当ステータスで返却
 * - その他の Error は 500 で返却
 */
type HandlerFn = (
  req: Request,
  ctx: ApiContext,
) => Promise<NextResponse | Record<string, unknown>>;

// ---------------------------------------------------------------------------
// withApiHandler
// ---------------------------------------------------------------------------

/**
 * 統一 API ルートハンドラーラッパー。
 *
 * @example
 * // 基本
 * export const GET = withApiHandler(async (req, { log, traceId }) => {
 *   log.info('Processing request');
 *   const data = await fetchData();
 *   return { data };
 * }, { service: 'my-api' });
 *
 * @example
 * // エラーハンドリング
 * export const POST = withApiHandler(async (req, { log }) => {
 *   const body = await req.json();
 *   if (!body.name) throw new ApiError(400, 'name は必須です');
 *   return { created: true };
 * });
 */
export function withApiHandler(
  handler: HandlerFn,
  options?: ApiHandlerOptions,
): (req: Request, routeCtx?: { params?: Promise<Record<string, string>> }) => Promise<NextResponse> {
  const service = options?.service ?? 'api';
  const captureErrors = options?.captureErrors ?? true;
  const exposeTraceId = options?.exposeTraceId ?? true;
  const maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  const log = createLogger(service, options?.logLevel);
  const serviceTracer = createTracer(service);

  return async (req: Request, routeCtx?: { params?: Promise<Record<string, string>> }) => {
    const traceId = getTraceIdFromRequest(req);
    const method = req.method;
    const url = new URL(req.url);
    const pathname = url.pathname;

    // 簡易ロガー（traceId 自動付与）
    const apiLog: ApiLogger = {
      debug: (msg, data) => log.debug(msg, { traceId, ...(data ? { data } : {}) }),
      info:  (msg, data) => log.info(msg, { traceId, ...(data ? { data } : {}) }),
      warn:  (msg, data) => log.warn(msg, { traceId, ...(data ? { data } : {}) }),
      error: (msg, data) => log.error(msg, { traceId, ...(data ? { data } : {}) }),
    };

    // Sentry に traceId を伝播（非同期、ノンブロッキング）
    void setSentryTraceTag(traceId);

    apiLog.info(`→ ${method} ${pathname}`);

    // -----------------------------------------------------------------------
    // リクエストボディサイズ制限チェック
    // -----------------------------------------------------------------------
    const contentLength = req.headers.get('Content-Length');
    if (contentLength !== null) {
      const bodySize = parseInt(contentLength, 10);
      if (!Number.isNaN(bodySize) && bodySize > maxBodySize) {
        apiLog.warn(`← ${method} ${pathname} 413: リクエストボディが上限を超過`, {
          contentLength: bodySize,
          maxBodySize,
        });
        const response = NextResponse.json(
          {
            success: false,
            error: `リクエストボディが上限（${maxBodySize} bytes）を超えています。`,
            traceId,
          } satisfies ApiErrorResponse,
          { status: 413 },
        );
        if (exposeTraceId) response.headers.set('X-Trace-Id', traceId);
        return response;
      }
    }

    // -----------------------------------------------------------------------
    // tracer.withSpan でハンドラー全体をトレース
    // -----------------------------------------------------------------------
    return serviceTracer.withSpan(
      'http.handler',
      traceId,
      async () => {
        const startMs = Date.now();

        try {
          // params を解決（Next.js 15 では Promise）
          const resolvedParams = routeCtx?.params ? await routeCtx.params : undefined;

          const ctx: ApiContext = {
            traceId,
            log: apiLog,
            params: resolvedParams ?? {},
          };

          const result = await handler(req, ctx);

          const durationMs = Date.now() - startMs;

          // ハンドラーが NextResponse を直接返した場合
          if (result instanceof NextResponse) {
            apiLog.info(`← ${method} ${pathname} ${result.status}`, { durationMs });
            if (exposeTraceId) {
              result.headers.set('X-Trace-Id', traceId);
            }
            return result;
          }

          // オブジェクトを返した場合 → { success: true, ...result } でラップ
          apiLog.info(`← ${method} ${pathname} 200`, { durationMs });
          const response = NextResponse.json(
            { success: true, ...result },
            { status: 200 },
          );
          if (exposeTraceId) {
            response.headers.set('X-Trace-Id', traceId);
          }
          return response;

        } catch (err) {
          const durationMs = Date.now() - startMs;

          // ApiError（意図的なエラー）
          if (err instanceof ApiError) {
            apiLog.warn(`← ${method} ${pathname} ${err.status}: ${err.userMessage}`, {
              durationMs,
              status: err.status,
            });

            const response = NextResponse.json(
              { success: false, error: err.userMessage, traceId } satisfies ApiErrorResponse,
              { status: err.status },
            );
            if (exposeTraceId) response.headers.set('X-Trace-Id', traceId);
            return response;
          }

          // 予期しないエラー
          log.errorFromException(`← ${method} ${pathname} 500`, err, {
            traceId,
            duration: durationMs,
          });

          // Sentry にキャプチャ（ノンブロッキング）
          if (captureErrors) {
            void captureSentryException(err, {
              traceId,
              data: { method, pathname, durationMs },
            });
          }

          // セキュリティ: 生のエラーメッセージは絶対にクライアントに返さない
          const response = NextResponse.json(
            { success: false, error: 'サーバー内部エラーが発生しました。', traceId } satisfies ApiErrorResponse,
            { status: 500 },
          );
          if (exposeTraceId) response.headers.set('X-Trace-Id', traceId);
          return response;
        }
      },
      {
        attributes: { method, pathname },
      },
    );
  };
}
