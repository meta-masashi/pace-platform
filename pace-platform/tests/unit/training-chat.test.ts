/**
 * tests/unit/training-chat.test.ts
 * ============================================================
 * トレーニングチャット API セキュリティ + ロジック テスト
 *
 * 対象: app/api/training/chat/route.ts
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const routePath = path.resolve(__dirname, '../../app/api/training/chat/route.ts')
const routeContent = fs.readFileSync(routePath, 'utf-8')

describe('training/chat route — コードパターン検証', () => {
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
    expect(routeContent).toMatch(/\.filter\s*\(/)
    expect(routeContent).toMatch(/role\s*===\s*['"]user['"]/)
    expect(routeContent).toMatch(/role\s*===\s*['"]assistant['"]/)
  })

  it('Standard vs Pro の差分レスポンスが実装されている', () => {
    expect(routeContent).toContain('isPro')
    expect(routeContent).toContain('individual_adjustments')
  })

  it('トークン予算超過で 429 + CTA を返す', () => {
    expect(routeContent).toContain('TOKEN_BUDGET_EXCEEDED')
    expect(routeContent).toContain('ctaOptions')
    expect(routeContent).toContain('429')
  })

  it('canAccess による plan gate が設定されている', () => {
    expect(routeContent).toContain('canAccess')
  })
})
