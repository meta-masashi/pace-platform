/**
 * tests/unit/api-handler.test.ts
 * ============================================================
 * withApiHandler の単体テスト
 *
 * - traceId 自動付与
 * - 構造化ログ出力
 * - ApiError による意図的エラーレスポンス
 * - 予期しないエラーのキャッチ
 * - NextResponse パススルー
 * ============================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withApiHandler, ApiError } from '../../lib/api/handler';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Sentry モック
// ---------------------------------------------------------------------------
vi.mock('@/lib/observability/sentry', () => ({
  setSentryTraceTag: vi.fn().mockResolvedValue(undefined),
  captureSentryException: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function createMockRequest(
  method: string = 'GET',
  url: string = 'http://localhost:3000/api/test',
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method,
    headers: new Headers(headers),
  });
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('withApiHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功時に { success: true, ...data } を返す', async () => {
    const handler = withApiHandler(async (_req, ctx) => {
      return { items: [1, 2, 3] };
    }, { service: 'test' });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.items).toEqual([1, 2, 3]);
  });

  it('レスポンスに X-Trace-Id ヘッダーが付与される', async () => {
    const handler = withApiHandler(async () => {
      return { ok: true };
    });

    const res = await handler(createMockRequest());
    expect(res.headers.get('X-Trace-Id')).toBeTruthy();
    expect(res.headers.get('X-Trace-Id')!.length).toBeGreaterThan(0);
  });

  it('リクエストの X-Trace-Id ヘッダーを引き継ぐ', async () => {
    const handler = withApiHandler(async () => {
      return { ok: true };
    });

    const traceId = 'test-trace-123';
    const req = createMockRequest('GET', 'http://localhost/api/test', {
      'X-Trace-Id': traceId,
    });

    const res = await handler(req);
    expect(res.headers.get('X-Trace-Id')).toBe(traceId);
  });

  it('ApiError を throw すると該当ステータスで返却される', async () => {
    const handler = withApiHandler(async () => {
      throw new ApiError(400, '入力が不正です');
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('入力が不正です');
    expect(body.traceId).toBeTruthy();
  });

  it('予期しない Error は 500 で返却される', async () => {
    const handler = withApiHandler(async () => {
      throw new Error('DB接続失敗');
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.traceId).toBeTruthy();
  });

  it('NextResponse を直接返すとパススルーされる', async () => {
    const handler = withApiHandler(async () => {
      return NextResponse.json(
        { success: true, custom: 'response' },
        { status: 201 },
      );
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.custom).toBe('response');
    expect(res.headers.get('X-Trace-Id')).toBeTruthy();
  });

  it('params が解決される', async () => {
    let receivedParams: Record<string, string> = {};

    const handler = withApiHandler(async (_req, ctx) => {
      receivedParams = ctx.params;
      return { ok: true };
    });

    const routeCtx = {
      params: Promise.resolve({ athleteId: '123' }),
    };

    await handler(createMockRequest(), routeCtx);
    expect(receivedParams).toEqual({ athleteId: '123' });
  });

  it('ctx.log が traceId 付きで動作する', async () => {
    let logCalled = false;

    const handler = withApiHandler(async (_req, ctx) => {
      // log メソッドが存在し呼び出し可能であることを確認
      expect(typeof ctx.log.info).toBe('function');
      expect(typeof ctx.log.error).toBe('function');
      expect(typeof ctx.log.warn).toBe('function');
      expect(typeof ctx.log.debug).toBe('function');
      ctx.log.info('test log');
      logCalled = true;
      return { ok: true };
    });

    await handler(createMockRequest());
    expect(logCalled).toBe(true);
  });

  it('exposeTraceId: false の場合ヘッダーが付与されない', async () => {
    const handler = withApiHandler(async () => {
      return { ok: true };
    }, { exposeTraceId: false });

    const res = await handler(createMockRequest());
    expect(res.headers.get('X-Trace-Id')).toBeNull();
  });

  it('エラーレスポンスにも traceId が含まれる', async () => {
    const handler = withApiHandler(async () => {
      throw new ApiError(403, 'アクセス拒否');
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(body.traceId).toBeTruthy();
    expect(typeof body.traceId).toBe('string');
  });
});
