/**
 * tests/unit/context-flags-resolver.test.ts
 * ============================================================
 * Calendar → contextFlags 解決テスト
 *
 * 対象: lib/calendar/context-flags-resolver.ts
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const resolverPath = path.resolve(__dirname, '../../lib/calendar/context-flags-resolver.ts')
const resolverContent = fs.readFileSync(resolverPath, 'utf-8')

describe('context-flags-resolver — コードパターン検証', () => {
  it('5分 TTL のキャッシュが実装されている', () => {
    expect(resolverContent).toContain('CACHE_TTL_MS')
    expect(resolverContent).toContain('5 * 60 * 1000')
  })

  it('キャッシュヒット時に早期リターンする', () => {
    expect(resolverContent).toMatch(/cached\s*&&/)
    expect(resolverContent).toContain('return cached.flags')
  })

  it('カレンダー未接続時にデフォルト flags を返す', () => {
    expect(resolverContent).toContain('defaultFlags')
    expect(resolverContent).toMatch(/isGameDay:\s*false/)
    expect(resolverContent).toMatch(/isGameDayMinus1:\s*false/)
  })

  it('エラー時に all-false フォールバックを返す', () => {
    // catch ブロックで defaultFlags を返すこと
    const catchIdx = resolverContent.lastIndexOf('catch (err)')
    const afterCatch = resolverContent.slice(catchIdx)
    expect(afterCatch).toContain('defaultFlags')
  })

  it('トークンリフレッシュ競合防止ロックが実装されている', () => {
    expect(resolverContent).toContain('refreshLocks')
    expect(resolverContent).toContain('lockKey')
  })

  it('clearContextFlagsCache がエクスポートされている', () => {
    expect(resolverContent).toMatch(/export\s+function\s+clearContextFlagsCache/)
  })
})
