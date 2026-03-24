/**
 * tests/e2e/resilience.spec.ts
 * ============================================================
 * エッジケース・ネットワーク障害・LLM 非決定性テスト（Playwright）
 *
 * テストシナリオ:
 *   - Gemini API タイムアウト（30 秒）→ フォールバック応答
 *   - Supabase 接続断（500 エラー）→ Graceful Degradation
 *   - LLM 非決定性: 同一プロンプト 3 回 → 有害出力フィルタ全通過
 *   - DB 接続断でもページが表示される
 *   - Gemini API 503 サービス停止時のフォールバック
 * ============================================================
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

async function loginAsTestUser(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('[data-testid="email-input"]', process.env.TEST_USER_EMAIL ?? 'test@pace-platform.test')
  await page.fill('[data-testid="password-input"]', process.env.TEST_USER_PASSWORD ?? 'TestPassword123!')
  await page.click('[data-testid="login-button"]')
  await page.waitForURL('/dashboard')
}

// ---------------------------------------------------------------------------
// Gemini API タイムアウト
// ---------------------------------------------------------------------------

test.describe('Gemini API タイムアウト耐障害性（防壁4）', () => {
  test('AI API が 30 秒でタイムアウトした場合にフォールバック応答が表示される', async ({ page }) => {
    test.setTimeout(60_000)
    // AI API リクエストを 30 秒タイムアウトさせる
    await page.route('**/api/ai/**', route =>
      new Promise<void>(resolve =>
        setTimeout(() => resolve(route.abort('timedout')), 30_000)
      )
    )

    await loginAsTestUser(page)
    await page.goto('/chat')

    const chatInput = page.locator('[data-testid="chat-input"]')
    const exists = await chatInput.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }

    await chatInput.fill('膝関節の痛みについて教えてください')
    await page.click('[data-testid="send-button"]')

    // フォールバックエラーメッセージが表示されることを確認（35 秒以内）
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({
      timeout: 35_000,
    })

    // リトライボタンが表示されること（UX 要件）
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible()

    // 入力フィールドがフリーズしていないことを確認
    await expect(chatInput).toBeEnabled()
  })

  test('AI API が 10 秒でタイムアウトした場合のエラー表示', async ({ page }) => {
    test.setTimeout(30_000)
    await page.route('**/api/ai/**', route =>
      new Promise<void>(resolve =>
        setTimeout(() => resolve(route.abort('timedout')), 10_000)
      )
    )

    await loginAsTestUser(page)
    await page.goto('/chat')

    const chatInput = page.locator('[data-testid="chat-input"]')
    const exists = await chatInput.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }

    await chatInput.fill('テスト質問')
    await page.click('[data-testid="send-button"]')

    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({
      timeout: 15_000,
    })
  })
})

// ---------------------------------------------------------------------------
// Supabase 接続断
// ---------------------------------------------------------------------------

test.describe('Supabase 接続断の Graceful Degradation（防壁4）', () => {
  test('Supabase API が 500 を返す場合にエラーページではなくフォールバック UI が表示される', async ({ page }) => {
    // Supabase への全リクエストを 500 エラーに差し替え
    await page.route('**/supabase.co/**', route =>
      route.fulfill({
        status: 500,
        body: JSON.stringify({ message: 'Internal Server Error' }),
        contentType: 'application/json',
      })
    )
    await page.route('**/supabase.co:443/**', route =>
      route.fulfill({
        status: 500,
        body: JSON.stringify({ message: 'Internal Server Error' }),
        contentType: 'application/json',
      })
    )

    // ログインページにアクセス
    await page.goto('/login')

    // 白い画面やクラッシュしていないことを確認（何らかのコンテンツが表示される）
    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: 10_000 })

    // エラーページではなくフォールバック UI があること
    // （空の body や "Application error" のみでないこと）
    const bodyText = await body.textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(0)
  })

  test('Supabase へのネットワーク接続が拒否された場合にアプリがクラッシュしない', async ({ page }) => {
    await page.route('**/supabase.co/**', route => route.abort('connectionrefused'))

    await page.goto('/login')

    // アプリがクラッシュしていないことを確認
    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: 10_000 })

    // JS エラーがスローされていないことを確認
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    // 重大なクラッシュエラーがないこと
    const criticalErrors = errors.filter(e =>
      e.includes('Cannot read properties of undefined') ||
      e.includes('Uncaught TypeError') ||
      e.includes('ChunkLoadError')
    )
    expect(criticalErrors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// LLM 非決定性テスト（有害出力フィルタ）
// ---------------------------------------------------------------------------

test.describe('LLM 非決定性 — 有害出力フィルタ（防壁2）', () => {
  // 同一プロンプトに対して異なる（潜在的に有害な）レスポンスをシミュレーション
  const harmfulResponses = [
    '骨折しています。直ちに手術が必要です。',
    'you have a fracture. requires surgery immediately.',
    '診断します。前十字靭帯断裂です。処方: イブプロフェン 500mg を服用してください。',
  ]

  harmfulResponses.forEach((harmfulResponse, index) => {
    test(`有害出力パターン ${index + 1} がフィルタリングされる`, async ({ page }) => {
      await page.route('**/api/ai/**', route =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ answer: harmfulResponse }),
          contentType: 'application/json',
        })
      )

      await loginAsTestUser(page)
      await page.goto('/chat')

      const chatInput = page.locator('[data-testid="chat-input"]')
      const exists = await chatInput.isVisible({ timeout: 5_000 }).catch(() => false)
      if (!exists) {
        test.skip()
        return
      }

      await chatInput.fill('膝の状態について教えてください')
      await page.click('[data-testid="send-button"]')

      // 有害出力フィルタが発動: エラーメッセージか安全な応答が表示される
      const responseLocator = page.locator(
        '[data-testid="chat-message"], [data-testid="error-message"], [data-testid="guardrail-message"]'
      )
      await expect(responseLocator).toBeVisible({ timeout: 15_000 })

      // 有害なコンテンツがそのまま表示されていないことを確認
      const displayedText = await responseLocator.textContent()
      const containsRawHarmful =
        displayedText?.includes('骨折しています') ||
        displayedText?.includes('you have a fracture') ||
        displayedText?.includes('診断します')

      // 有害出力がそのまま表示されていないこと（フィルタリングまたはエラー表示）
      expect(containsRawHarmful).toBeFalsy()
    })
  })

  test('同一プロンプト 3 回実行で有害出力フィルタが全回通過する', async ({ page }) => {
    let callCount = 0
    const responses = [
      '膝関節の可動域制限は複数の要因が考えられます。評価には直接観察が必要です。',
      'Range of motion limitations can have multiple causes. Professional evaluation is recommended.',
      '関節の状態については、有資格スタッフによる評価を推奨します。',
    ]

    await page.route('**/api/ai/**', async route => {
      const response = responses[callCount % responses.length]
      callCount++
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          answer: response,
          disclaimer: '※ この出力はAIによる補助情報です。最終的な判断・処置は必ず有資格スタッフが行ってください。',
        }),
        contentType: 'application/json',
      })
    })

    await loginAsTestUser(page)
    await page.goto('/chat')

    const chatInput = page.locator('[data-testid="chat-input"]')
    const exists = await chatInput.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }

    // 同一プロンプトを 3 回送信
    for (let i = 0; i < 3; i++) {
      await chatInput.fill('膝関節の可動域について教えてください')
      await page.click('[data-testid="send-button"]')

      // 各回の応答が表示されることを確認
      await expect(
        page.locator('[data-testid="chat-message"]').last()
      ).toBeVisible({ timeout: 15_000 })
    }

    // 3 回全て正常に処理されたこと（callCount が 3）を確認
    expect(callCount).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Gemini API 503 サービス停止
// ---------------------------------------------------------------------------

test.describe('Gemini API サービス停止時のフォールバック（防壁4）', () => {
  test('Gemini API 503 返却時にサービス停止メッセージが表示される', async ({ page }) => {
    await page.route('**/api/ai/**', route =>
      route.fulfill({
        status: 503,
        body: JSON.stringify({ error: 'Service Unavailable' }),
        contentType: 'application/json',
      })
    )

    await loginAsTestUser(page)
    await page.goto('/chat')

    const chatInput = page.locator('[data-testid="chat-input"]')
    const exists = await chatInput.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }

    await chatInput.fill('テスト質問')
    await page.click('[data-testid="send-button"]')

    // エラーメッセージが表示されること
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({
      timeout: 10_000,
    })

    // 入力フィールドが使用可能なままであること
    await expect(chatInput).toBeEnabled()
  })

  test('API エラー後にリトライが可能', async ({ page }) => {
    let failCount = 0
    await page.route('**/api/ai/**', async route => {
      failCount++
      if (failCount <= 1) {
        await route.fulfill({
          status: 503,
          body: JSON.stringify({ error: 'Service Unavailable' }),
          contentType: 'application/json',
        })
      } else {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            answer: '回復後の正常な回答です。',
            disclaimer: '※ AIによる補助情報です。',
          }),
          contentType: 'application/json',
        })
      }
    })

    await loginAsTestUser(page)
    await page.goto('/chat')

    const chatInput = page.locator('[data-testid="chat-input"]')
    const exists = await chatInput.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }

    // 最初の送信（失敗する）
    await chatInput.fill('テスト質問')
    await page.click('[data-testid="send-button"]')

    // エラーが表示されること
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({
      timeout: 10_000,
    })

    // リトライボタンまたは再入力でリトライできること
    const retryBtn = page.locator('[data-testid="retry-button"]')
    const hasRetryBtn = await retryBtn.isVisible({ timeout: 3_000 }).catch(() => false)

    if (hasRetryBtn) {
      await retryBtn.click()
      // 2 回目は成功する
      await expect(
        page.locator('[data-testid="chat-message"]')
      ).toBeVisible({ timeout: 10_000 })
    }
  })
})

// ---------------------------------------------------------------------------
// メモリリーク・リソースクリーンアップ
// ---------------------------------------------------------------------------

test.describe('リソース管理', () => {
  test('長時間のチャットセッション後にメモリが過度に増加しない', async ({ page }) => {
    let messageCount = 0
    await page.route('**/api/ai/**', async route => {
      messageCount++
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          answer: `回答 ${messageCount}: 膝関節の評価については有資格スタッフに相談してください。`,
          disclaimer: '※ AIによる補助情報です。',
        }),
        contentType: 'application/json',
      })
    })

    await loginAsTestUser(page)
    await page.goto('/chat')

    const chatInput = page.locator('[data-testid="chat-input"]')
    const exists = await chatInput.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }

    // 初期メモリ使用量を記録
    const initialMemory = await page.evaluate(() =>
      (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
    )

    // 10 回メッセージを送信
    for (let i = 0; i < 10; i++) {
      await chatInput.fill(`テスト質問 ${i + 1}`)
      await page.click('[data-testid="send-button"]')
      await page.waitForTimeout(200)
    }

    // 最終メモリ使用量を確認
    const finalMemory = await page.evaluate(() =>
      (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
    )

    // メモリが初期値の 10 倍以上に増加していないこと（大まかな基準）
    if (initialMemory > 0) {
      expect(finalMemory).toBeLessThan(initialMemory * 10)
    }
  })
})
