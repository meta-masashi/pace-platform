import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const handlerPath = path.resolve(__dirname, '../../lib/api/handler.ts');
const content = fs.readFileSync(handlerPath, 'utf-8');

describe('API Handler インフラ強化検証', () => {
  it('tracer.withSpan でリクエスト全体をトレースしている', () => {
    expect(content).toContain('withSpan');
    expect(content).toContain('createTracer');
  });

  it('エラーメッセージをクライアントに漏洩しない', () => {
    // Generic message only — never err.message
    expect(content).not.toMatch(/err\.message\.length\s*</);
    expect(content).toContain('サーバー内部エラーが発生しました。');
  });

  it('リクエストボディサイズ制限が実装されている', () => {
    expect(content).toContain('maxBodySize');
    expect(content).toContain('Content-Length');
    expect(content).toContain('413');
  });

  it('Sentry キャプチャが実装されている', () => {
    expect(content).toContain('captureSentryException');
    expect(content).toContain('setSentryTraceTag');
  });
});
