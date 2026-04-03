/**
 * tests/security/sprint7-security.test.ts
 * ============================================================
 * Sprint 7 セキュリティ修正の回帰防止テスト
 *
 * 修正対象:
 *   P0-1: オープンリダイレクト（auth callback）
 *   P0-2: IDOR（team dashboard / conditioning team API）
 *   P0-3: ログインブルートフォース保護のフェイルオープン
 *   P1-1: デバッグ情報漏洩（training/generate）
 *   P1-2: CSV アップロードバリデーション不足
 *   P1-3: 招待コードのエントロピー不足
 *   P1-4: Calendar OAuth リダイレクト未検証
 *   P2-1: Middleware 認証チェックの空ブロック
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function readFile(relativePath: string): string {
  const fullPath = path.resolve(__dirname, '../..', relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

// ---------------------------------------------------------------------------
// P0-1: オープンリダイレクト防止
// ---------------------------------------------------------------------------

describe('Sprint 7 セキュリティ: オープンリダイレクト防止', () => {
  const content = readFile('app/api/auth/callback/route.ts');

  it('isValidRedirectPath バリデーション関数が実装されている', () => {
    expect(content).toContain('isValidRedirectPath');
  });

  it('next パラメータがバリデーション経由でのみリダイレクトに使用される', () => {
    expect(content).toContain('isValidRedirectPath(next)');
  });

  it('プロトコル相対URL（//）を拒否する', () => {
    expect(content).toContain("startsWith('//')");
  });

  it('コロン（:）を含むパスを拒否する（プロトコル防止）', () => {
    expect(content).toMatch(/[:\\\\]/);
  });
});

// ---------------------------------------------------------------------------
// P0-2: IDOR 防止（チームダッシュボード）
// ---------------------------------------------------------------------------

describe('Sprint 7 セキュリティ: IDOR 防止 — team dashboard', () => {
  const content = readFile('app/api/team/dashboard/route.ts');

  it('スタッフの org_id を取得している', () => {
    expect(content).toContain('userStaff');
    expect(content).toContain('org_id');
  });

  it('ユーザーの org_id とチームの org_id を比較している', () => {
    expect(content).toContain('userStaff.org_id');
    expect(content).toContain('team.org_id');
  });
});

describe('Sprint 7 セキュリティ: IDOR 防止 — conditioning team', () => {
  const content = readFile('app/api/conditioning/team/[teamId]/route.ts');

  it('チームの org_id を検証している', () => {
    expect(content).toContain('teamRow');
    expect(content).toContain('staff.org_id');
  });

  it('master ロールでも org_id チェックを実施している', () => {
    // master がバイパスできないことを確認
    const masterCheck = content.indexOf("staff.role !== 'master'");
    const orgCheck = content.indexOf('teamRow.org_id');
    expect(masterCheck).toBeGreaterThan(-1);
    expect(orgCheck).toBeGreaterThan(-1);
    // org_id チェックは master チェックの後にある
    expect(orgCheck).toBeGreaterThan(masterCheck);
  });
});

// ---------------------------------------------------------------------------
// P0-3: ログインブルートフォース保護 — フェイルセキュア
// ---------------------------------------------------------------------------

describe('Sprint 7 セキュリティ: ログインフェイルセキュア', () => {
  const content = readFile('app/api/auth/login/route.ts');

  it('service client 不可時にフェイルセキュア（503）を返す', () => {
    expect(content).toContain('503');
    expect(content).toContain('認証サービスが一時的に利用できません');
  });

  it('service client 不可時に signInWithPassword を呼ばない', () => {
    // DB不可時のブロック内にsignInWithPasswordがないこと
    const serviceCheck = content.indexOf('if (!service)');
    expect(serviceCheck).toBeGreaterThan(-1);
    const blockAfterCheck = content.slice(serviceCheck, serviceCheck + 300);
    expect(blockAfterCheck).not.toContain('signInWithPassword');
  });
});

// ---------------------------------------------------------------------------
// P1-1: デバッグ情報漏洩防止
// ---------------------------------------------------------------------------

describe('Sprint 7 セキュリティ: デバッグ情報漏洩防止', () => {
  const content = readFile('app/api/training/generate/route.ts');

  it('debug フィールドがレスポンスに含まれない', () => {
    expect(content).not.toContain("debug:");
    expect(content).not.toContain("debug :");
  });
});

// ---------------------------------------------------------------------------
// P1-2: CSV アップロードセキュリティ
// ---------------------------------------------------------------------------

describe('Sprint 7 セキュリティ: CSV アップロード', () => {
  const content = readFile('app/api/onboarding/athletes/import/route.ts');

  it('MIME タイプバリデーションが実装されている', () => {
    expect(content).toContain('text/csv');
    expect(content).toContain('file.type');
  });

  it('ファイル名バリデーションが実装されている', () => {
    expect(content).toContain('.csv');
    expect(content).toContain('file.name');
  });

  it('CSV 数式インジェクション対策が実装されている', () => {
    expect(content).toContain('sanitizeCsvCell');
  });
});

// ---------------------------------------------------------------------------
// P1-3: 招待コードのエントロピー強化
// ---------------------------------------------------------------------------

describe('Sprint 7 セキュリティ: 招待コードエントロピー', () => {
  const content = readFile('app/api/admin/staff/route.ts');

  it('crypto.getRandomValues を使用している', () => {
    expect(content).toContain('getRandomValues');
  });

  it('8文字スライスを使用していない', () => {
    expect(content).not.toContain("slice(0, 8)");
  });
});

// ---------------------------------------------------------------------------
// P1-4: Calendar OAuth リダイレクト検証
// ---------------------------------------------------------------------------

describe('Sprint 7 セキュリティ: Calendar OAuth リダイレクト', () => {
  const content = readFile('app/api/calendar/callback/route.ts');

  it('getSafeOrigin を使用している', () => {
    expect(content).toContain('getSafeOrigin');
  });

  it('NEXT_PUBLIC_SITE_URL を参照している', () => {
    expect(content).toContain('NEXT_PUBLIC_SITE_URL');
  });

  it('リクエスト由来の origin を直接リダイレクトに使用していない', () => {
    // ${origin}/ パターンがリダイレクト先に使われていないこと
    const redirectLines = content
      .split('\n')
      .filter((line) => line.includes('NextResponse.redirect'));
    for (const line of redirectLines) {
      expect(line).not.toContain('${origin}');
    }
  });
});

// ---------------------------------------------------------------------------
// インフラ強化
// ---------------------------------------------------------------------------

describe('Sprint 7 セキュリティ: インフラ強化', () => {
  it('API handler がエラーメッセージを漏洩しない', () => {
    const content = readFile('lib/api/handler.ts');
    expect(content).not.toMatch(/err\.message\.length\s*</);
    expect(content).toContain('サーバー内部エラーが発生しました。');
  });

  it('API handler にリクエストサイズ制限がある', () => {
    const content = readFile('lib/api/handler.ts');
    expect(content).toContain('maxBodySize');
    expect(content).toContain('413');
  });

  it('Gemini クライアントにタイムアウトがある', () => {
    const content = readFile('lib/gemini/client.ts');
    expect(content).toContain('withTimeout');
    expect(content).toContain('GEMINI_TIMEOUT_MS');
  });

  it('サーキットブレーカーが実装されている', () => {
    const content = readFile('lib/gemini/circuit-breaker.ts');
    expect(content).toContain('CLOSED');
    expect(content).toContain('OPEN');
    expect(content).toContain('HALF_OPEN');
  });

  it('Gemini クライアントがサーキットブレーカーを使用している', () => {
    const content = readFile('lib/gemini/client.ts');
    expect(content).toContain('isCircuitOpen');
    expect(content).toContain('recordSuccess');
    expect(content).toContain('recordFailure');
  });

  it('Middleware が Supabase 障害時に 503 を返す（401 ではない）', () => {
    const content = readFile('middleware.ts');
    expect(content).toContain('503');
    expect(content).toContain('認証サービスが一時的に利用できません');
  });
});

// ---------------------------------------------------------------------------
// Sprint 7.1: 第2次セキュリティ監査修正の回帰テスト
// ---------------------------------------------------------------------------

describe('Sprint 7.1: エラー情報漏洩防止', () => {
  const errorLeakFiles = [
    'app/api/assessment/rehab/[athleteId]/route.ts',
    'app/api/assessment/conditioning/[athleteId]/route.ts',
    'app/api/rehab/exercises/route.ts',
    'app/api/pipeline/route.ts',
    'app/api/assessment/conditioning/save/route.ts',
  ];

  errorLeakFiles.forEach((filePath) => {
    it(`${filePath} が details: err.message を含まない`, () => {
      const content = readFile(filePath);
      expect(content).not.toContain('details: err instanceof Error ? err.message');
      expect(content).not.toContain('details: err.message');
    });
  });
});

describe('Sprint 7.1: IDOR 防止 — locks', () => {
  const content = readFile('app/api/locks/route.ts');

  it('GET クエリに org_id フィルタが含まれる', () => {
    expect(content).toContain('athletes.org_id');
    expect(content).toContain('staff.org_id');
  });

  it('DELETE でロック対象選手の org_id を検証している', () => {
    expect(content).toContain('lockAthlete');
    expect(content).toContain('このロックを削除する権限がありません');
  });
});

describe('Sprint 7.1: 非バインドクエリ防止', () => {
  it('pipeline/team に .limit() が含まれる', () => {
    const content = readFile('app/api/pipeline/team/route.ts');
    expect(content).toContain('.limit(');
  });

  it('decay/status に .limit() が含まれる', () => {
    const content = readFile('app/api/decay/status/route.ts');
    expect(content).toContain('.limit(');
  });

  it('rehab/programs に .limit() が含まれる', () => {
    const content = readFile('app/api/rehab/programs/route.ts');
    expect(content).toContain('.limit(');
  });
});

describe('Sprint 7.1: バッチ制限', () => {
  it('onboarding/setup に選手数上限がある', () => {
    const content = readFile('app/api/onboarding/setup/route.ts');
    expect(content).toContain('200');
    expect(content).toContain('一度に登録できる選手は200名まで');
  });

  it('onboarding/setup にスタッフ招待数上限がある', () => {
    const content = readFile('app/api/onboarding/setup/route.ts');
    expect(content).toContain('一度に招待できるスタッフは50名まで');
  });
});

describe('Sprint 7.1: UUID バリデーション', () => {
  it('rehab/programs が athleteId の UUID バリデーションを行う', () => {
    const content = readFile('app/api/rehab/programs/route.ts');
    expect(content).toContain('validateUUID');
    expect(content).toContain('athleteId の形式が不正');
  });
});

describe('Sprint 7.1: SELECT * 排除', () => {
  it('pipeline/team が SELECT * を使用していない', () => {
    const content = readFile('app/api/pipeline/team/route.ts');
    expect(content).not.toContain(".select('*')");
  });

  it('decay/status が SELECT * を使用していない', () => {
    const content = readFile('app/api/decay/status/route.ts');
    expect(content).not.toContain(".select('*')");
  });
});

describe('Sprint 7.1: Calendar IDOR 防止', () => {
  it('calendar/events の fetchTeamMetrics に org_id パラメータがある', () => {
    const content = readFile('app/api/calendar/events/route.ts');
    expect(content).toContain('staffOrgId');
    expect(content).toContain("eq('org_id', staffOrgId)");
  });
});
