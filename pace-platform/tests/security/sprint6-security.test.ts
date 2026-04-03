/**
 * tests/security/sprint6-security.test.ts
 * ============================================================
 * Sprint 6 セキュリティ監査テスト
 *
 * Phase 6 Sprint 6 で修正したセキュリティ問題の回帰防止テスト。
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function readFile(relativePath: string): string {
  const fullPath = path.resolve(__dirname, '../..', relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

// ---------------------------------------------------------------------------
// AI API ルートのセキュリティパターン検証
// ---------------------------------------------------------------------------

const AI_ROUTES = [
  'app/api/rehab/chat/route.ts',
  'app/api/training/chat/route.ts',
]

describe('Sprint 6 セキュリティ: AI API ルート', () => {
  for (const route of AI_ROUTES) {
    describe(route, () => {
      const content = readFile(route)

      it('canAccess / plan gate が設定されている', () => {
        expect(content).toContain('canAccess')
      })

      it('sanitizeUserInput がインポートされている', () => {
        expect(content).toContain('sanitizeUserInput')
      })

      it('メッセージ長制限が設定されている', () => {
        expect(content).toMatch(/message\.length\s*>\s*5_000/)
      })

      it('chat history のロールバリデーションが実装されている', () => {
        expect(content).toMatch(/\.filter\s*\(/)
        expect(content).toMatch(/role\s*===\s*['"]user['"]/)
      })

      it('checkRateLimit が呼び出されている（P1-3）', () => {
        expect(content).toContain('checkRateLimit')
        expect(content).toContain('buildRateLimitResponse')
      })

      it('IDOR 防止: master 以外は team_id で制限（P0-3）', () => {
        expect(content).toContain("staff.role !== 'master'")
        expect(content).toContain('staff.team_id')
      })

      it('updated_at を設定している（P1-2 並行書き込み対策）', () => {
        expect(content).toContain('updated_at')
      })
    })
  }
})

// ---------------------------------------------------------------------------
// rate-limiter のセキュリティ検証
// ---------------------------------------------------------------------------

describe('Sprint 6 セキュリティ: rate-limiter', () => {
  const content = readFile('lib/gemini/rate-limiter.ts')

  it('インメモリフォールバックが実装されている', () => {
    expect(content).toContain('checkInMemoryRateLimit')
    expect(content).toContain('inMemoryWindow')
    expect(content).toContain('FALLBACK_LIMIT_PER_MIN')
  })

  it('DB null 時にフェイルオープンしない（インメモリフォールバック使用）', () => {
    const nullBlock = content.slice(
      content.indexOf('if (!supabase)'),
      content.indexOf('if (!supabase)') + 200,
    )
    expect(nullBlock).toContain('checkInMemoryRateLimit')
    expect(nullBlock).not.toContain('allowed: true')
  })

  it('日次上限クエリが org 全体の staff_id を使用', () => {
    expect(content).toContain('orgStaff')
    expect(content).toContain('orgStaffIds')
    expect(content).toMatch(/\.in\s*\(\s*['"]staff_id['"]/)
  })

  it('checkRateLimit の catch ブロックでフェイルオープンしない', () => {
    const checkRateLimitStart = content.indexOf('export async function checkRateLimit')
    const checkRateLimitBlock = content.slice(checkRateLimitStart, checkRateLimitStart + 3000)
    const catchIdx = checkRateLimitBlock.lastIndexOf('catch (err)')
    expect(catchIdx).toBeGreaterThan(-1)
    const catchBlock = checkRateLimitBlock.slice(catchIdx, catchIdx + 300)
    expect(catchBlock).toContain('checkInMemoryRateLimit')
  })

  it('checkMonthlyBudget が DB 不可時にフェイルオープンしない（P0-1）', () => {
    const budgetStart = content.indexOf('export async function checkMonthlyBudget')
    const budgetBlock = content.slice(budgetStart, budgetStart + 3000)

    // DB null 時: allowed: false
    const nullIdx = budgetBlock.indexOf('if (!supabase)')
    const nullBlock = budgetBlock.slice(nullIdx, nullIdx + 200)
    expect(nullBlock).toContain('allowed: false')

    // catch 時: allowed: false
    const catchIdx = budgetBlock.lastIndexOf('catch (err)')
    const catchBlock = budgetBlock.slice(catchIdx, catchIdx + 200)
    expect(catchBlock).toContain('allowed: false')
  })
})

// ---------------------------------------------------------------------------
// security-helpers の検証
// ---------------------------------------------------------------------------

describe('Sprint 6 セキュリティ: security-helpers', () => {
  const content = readFile('lib/shared/security-helpers.ts')

  it('Unicode NFC 正規化が実装されている', () => {
    expect(content).toContain("normalize('NFC')")
  })

  it('Zero-width 文字除去が実装されている', () => {
    expect(content).toContain('\\u200B')
    expect(content).toContain('\\uFEFF')
  })

  it('全角英数→ASCII 変換が実装されている', () => {
    expect(content).toContain('\\uFF01')
    expect(content).toContain('0xFEE0')
  })

  it('hedged 医療診断パターンが追加されている', () => {
    expect(content).toContain('おそらく')
    expect(content).toContain('ほぼ確実に')
    expect(content).toContain('likely')
  })
})

// ---------------------------------------------------------------------------
// rehab/chat の禁忌ロジック検証
// ---------------------------------------------------------------------------

describe('Sprint 6 セキュリティ: 禁忌ロジック + Finalize', () => {
  const content = readFile('app/api/rehab/chat/route.ts')

  it('hasContraindicationViolation パターンが使用されている（旧バグなし）', () => {
    expect(content).toContain('hasContraindicationViolation')
    expect(content).not.toMatch(/menu\s*===\s*undefined/)
  })

  it('AI 禁忌タグとベイズ禁忌タグがマージされる', () => {
    expect(content).toContain('mergedContraindications')
  })

  it('finalize 時に承認記録が保存される', () => {
    expect(content).toContain('approved_at')
    expect(content).toContain('approved_by')
    expect(content).toContain('approved_contraindications')
  })

  it('finalize の RBAC チェックが Gemini 呼び出し前（P1-1）', () => {
    // 早期の finalize 権限チェック
    const earlyCheck = content.indexOf("if (body.finalize) {\n    const approvalRoles")
    const geminiCall = content.indexOf('await callGeminiWithRetry')
    expect(earlyCheck).toBeGreaterThan(-1)
    expect(geminiCall).toBeGreaterThan(-1)
    expect(earlyCheck).toBeLessThan(geminiCall)
  })

  it('二重承認防止チェックが存在する（P0-2）', () => {
    expect(content).toContain('approved_at')
    expect(content).toContain('既に承認済み')
    expect(content).toContain('409')
  })

  it('finalize 時に sessionId 必須チェックがある（P0-2）', () => {
    expect(content).toContain('セッションIDが必要')
  })

  it('finalize 時に最新ロック状態を再検証（P2-1）', () => {
    expect(content).toContain('currentLocks')
    expect(content).toContain('currentHardLock')
  })
})

// ---------------------------------------------------------------------------
// middleware の Content-Type 検証
// ---------------------------------------------------------------------------

describe('Sprint 6 セキュリティ: middleware', () => {
  const content = readFile('middleware.ts')

  it('Content-Type バリデーションが実装されている', () => {
    expect(content).toContain('content-type')
    expect(content).toContain('application/json')
    expect(content).toContain('multipart/form-data')
    expect(content).toContain('415')
  })

  it('CSRF: Sec-Fetch-Site でブラウザリクエストを判別（P2-3）', () => {
    expect(content).toContain('sec-fetch-site')
    expect(content).toContain('secFetchSite')
  })
})

// ---------------------------------------------------------------------------
// Calendar トークンリフレッシュ検証
// ---------------------------------------------------------------------------

describe('Sprint 6 セキュリティ: Calendar トークンリフレッシュ', () => {
  const content = readFile('lib/calendar/context-flags-resolver.ts')

  it('リフレッシュトークンの空文字チェックが存在（P2-2）', () => {
    expect(content).toContain('refreshed.accessToken')
    expect(content).toMatch(/trim\(\)\s*===\s*['"]/)
  })
})
