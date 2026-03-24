/**
 * tests/unit/retry-handler.test.ts
 * ============================================================
 * リトライハンドラー単体テスト（防壁4）
 *
 * 対象: lib/shared/retry-handler.ts
 *   - withRetry()
 *   - parseJsonWithRecovery()
 *   - isEmptyResponse()
 * ============================================================
 */

import { describe, it, expect, vi } from 'vitest'
import {
  withRetry,
  parseJsonWithRecovery,
  isEmptyResponse,
} from '../../lib/shared/retry-handler'

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  it('成功時に result と attempts と totalElapsedMs を返す', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const { result, attempts, totalElapsedMs } = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 0,
    })
    expect(result).toBe('success')
    expect(attempts).toBe(1)
    expect(totalElapsedMs).toBeGreaterThanOrEqual(0)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('1 回失敗後に成功する場合に attempts=2 を返す', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount < 2) throw new Error('一時エラー')
      return 'success'
    })

    const { result, attempts } = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 0,
    })
    expect(result).toBe('success')
    expect(attempts).toBe(2)
  })

  it('全リトライ失敗時に RETRY_EXHAUSTED エラーをスローする', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('永続エラー'))
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 0 })).rejects.toThrow('RETRY_EXHAUSTED')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('shouldNotRetry が true の場合は即座に再スローする', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('RATE_LIMIT_EXCEEDED'))
    const shouldNotRetry = (err: unknown) =>
      err instanceof Error && err.message === 'RATE_LIMIT_EXCEEDED'

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 0, shouldNotRetry })
    ).rejects.toThrow('RATE_LIMIT_EXCEEDED')

    // shouldNotRetry が true の場合は 1 回しか呼ばれない
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('onRetry フックがリトライ回数分呼ばれる', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('err1'))
      .mockRejectedValueOnce(new Error('err2'))
      .mockResolvedValue('ok')

    const onRetry = vi.fn()
    await withRetry(fn, { maxRetries: 3, baseDelayMs: 0, onRetry })
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
    expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error))
  })

  it('maxRetries=1 の場合に 1 回だけ試行する', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('error'))
    await expect(withRetry(fn, { maxRetries: 1, baseDelayMs: 0 })).rejects.toThrow('RETRY_EXHAUSTED')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('RETRY_EXHAUSTED エラーに cause プロパティで元のエラーが含まれる', async () => {
    const originalError = new Error('original error')
    const fn = vi.fn().mockRejectedValue(originalError)

    try {
      await withRetry(fn, { maxRetries: 1, baseDelayMs: 0 })
      expect.fail('エラーがスローされるべきです')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error & { cause: unknown }).cause).toBe(originalError)
    }
  })
})

// ---------------------------------------------------------------------------
// parseJsonWithRecovery
// ---------------------------------------------------------------------------

describe('parseJsonWithRecovery', () => {
  it('正常なJSONをパースする', () => {
    const result = parseJsonWithRecovery<{ key: string }>('{"key": "value"}')
    expect(result).toEqual({ key: 'value' })
  })

  it('コードフェンス付きJSONをパースする', () => {
    const input = '```json\n{"status": "ok"}\n```'
    const result = parseJsonWithRecovery<{ status: string }>(input)
    expect(result).toEqual({ status: 'ok' })
  })

  it('前後に余分なテキストがあるJSONをパースする', () => {
    const input = 'AI出力です:\n{"score": 0.9}\n以上。'
    const result = parseJsonWithRecovery<{ score: number }>(input)
    expect(result).toEqual({ score: 0.9 })
  })

  it('配列JSONをパースする', () => {
    const input = '```\n[1, 2, 3]\n```'
    const result = parseJsonWithRecovery<number[]>(input)
    expect(result).toEqual([1, 2, 3])
  })

  it('完全に無効なJSONでSyntaxErrorをスローする', () => {
    expect(() => parseJsonWithRecovery('完全に無効なテキストonly')).toThrow(SyntaxError)
  })

  it('ネストしたJSONオブジェクトをパースする', () => {
    const input = '{"rehab": {"exercises": ["squat", "lunge"], "sets": 3}}'
    const result = parseJsonWithRecovery<{ rehab: { exercises: string[]; sets: number } }>(input)
    expect(result.rehab.exercises).toContain('squat')
    expect(result.rehab.sets).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// isEmptyResponse
// ---------------------------------------------------------------------------

describe('isEmptyResponse', () => {
  it('null は空レスポンスと判定する', () => {
    expect(isEmptyResponse(null)).toBe(true)
  })

  it('undefined は空レスポンスと判定する', () => {
    expect(isEmptyResponse(undefined)).toBe(true)
  })

  it('空文字列は空レスポンスと判定する', () => {
    expect(isEmptyResponse('')).toBe(true)
  })

  it('空白のみの文字列は空レスポンスと判定する', () => {
    expect(isEmptyResponse('   \n\t  ')).toBe(true)
  })

  it('{} は空レスポンスと判定する', () => {
    expect(isEmptyResponse('{}')).toBe(true)
  })

  it('[] は空レスポンスと判定する', () => {
    expect(isEmptyResponse('[]')).toBe(true)
  })

  it('コンテンツがある場合は非空と判定する', () => {
    expect(isEmptyResponse('{"key": "value"}')).toBe(false)
    expect(isEmptyResponse('リハビリプランを生成しました')).toBe(false)
  })
})
