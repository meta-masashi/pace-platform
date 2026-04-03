/**
 * tests/unit/rehab-chat.test.ts
 * ============================================================
 * リハビリチャット API セキュリティ + ロジック テスト
 *
 * 対象: app/api/rehab/chat/route.ts
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const routePath = path.resolve(__dirname, '../../app/api/rehab/chat/route.ts')
const routeContent = fs.readFileSync(routePath, 'utf-8')

describe('rehab/chat route — コードパターン検証', () => {
  it('sanitizeUserInput がインポートされている', () => {
    expect(routeContent).toContain('sanitizeUserInput')
    expect(routeContent).toMatch(/import\s*\{[^}]*sanitizeUserInput[^}]*\}\s*from/)
  })

  it('メッセージ長制限（5000文字）が設定されている', () => {
    expect(routeContent).toContain('5_000')
    expect(routeContent).toMatch(/message\.length\s*>\s*5_000/)
  })

  it('sanitizeUserInput がメッセージに適用されている', () => {
    expect(routeContent).toContain('sanitizeUserInput(body.message)')
  })

  it('chat history のロールバリデーションが実装されている', () => {
    // user | assistant のみ許可するフィルタがあること
    expect(routeContent).toMatch(/\.filter\s*\(/)
    expect(routeContent).toMatch(/role\s*===\s*['"]user['"]/)
    expect(routeContent).toMatch(/role\s*===\s*['"]assistant['"]/)
  })

  it('禁忌タグ違反時に hasContraindicationViolation フラグが使用されている', () => {
    expect(routeContent).toContain('hasContraindicationViolation')
    // 旧バグパターン（menu === undefined）がないこと
    expect(routeContent).not.toMatch(/menu\s*===\s*undefined/)
  })

  it('AI 提案の禁忌タグがベイズ結果とマージされる', () => {
    expect(routeContent).toContain('mergedContraindications')
    expect(routeContent).toContain('aiContraindicationTags')
    expect(routeContent).toContain('contraindication_tags')
  })

  it('finalize 処理が実装されている', () => {
    expect(routeContent).toContain('body.finalize')
    expect(routeContent).toContain('approved_at')
    expect(routeContent).toContain('approved_by')
    expect(routeContent).toContain('approved_contraindications')
  })

  it('承認権限が AT/PT/master に制限されている', () => {
    expect(routeContent).toMatch(/approvalRoles/)
    expect(routeContent).toContain("'AT'")
    expect(routeContent).toContain("'PT'")
    expect(routeContent).toContain("'master'")
  })

  it('Hard Lock 時は Gemini を呼び出さない', () => {
    // hardLock 条件分岐が callGeminiWithRetry の実際の呼び出しより前にあること
    const hardLockIdx = routeContent.indexOf('if (hardLock) {')
    // import ではなく実際の呼び出し（await callGeminiWithRetry）を検索
    const geminiIdx = routeContent.indexOf('await callGeminiWithRetry')
    expect(hardLockIdx).toBeGreaterThan(-1)
    expect(geminiIdx).toBeGreaterThan(-1)
    expect(hardLockIdx).toBeLessThan(geminiIdx)
  })

  it('Pro plan gate が設定されている', () => {
    expect(routeContent).toContain('canAccess')
    expect(routeContent).toContain('feature_ai_weekly_plan')
  })

  it('レスポンスに contraindicationTags が含まれている', () => {
    expect(routeContent).toContain('contraindicationTags')
  })
})
