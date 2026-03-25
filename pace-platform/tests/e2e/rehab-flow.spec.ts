/**
 * tests/e2e/rehab-flow.spec.ts
 * ============================================================
 * リハビリ管理フロー E2E テスト
 *
 * テストシナリオ:
 *   1. 新規リハビリプログラム作成
 *   2. フェーズステッパーの表示確認
 *   3. AI メニュー生成
 *   4. ゲート承認（Leader ロール）
 *
 * 注意: 実行サーバーが必要。CI ではスキップされる。
 * ============================================================
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// テストスイート（サーバー未起動のため skip）
// ---------------------------------------------------------------------------

test.describe('リハビリ管理フロー', () => {
  test.describe.configure({ mode: 'serial' })

  test.skip(true, 'サーバー未起動のためスキップ — npm run dev 実行後に有効化')

  test.beforeEach(async ({ page }) => {
    // ログイン状態のセットアップ
  })

  // -----------------------------------------------------------------------
  // プログラム作成
  // -----------------------------------------------------------------------

  test('新規リハビリプログラムを作成できる', async ({ page }) => {
    await page.goto('/rehab/new')

    // フォーム入力
    await page.fill('[data-testid="program-name"]', 'テスト ACL リハビリプログラム')
    await page.click('[data-testid="athlete-select"]')
    await page.click('[data-testid="athlete-option"]:first-child')
    await page.selectOption('[data-testid="injury-type"]', 'acl_reconstruction')

    // 作成ボタン
    await page.click('[data-testid="create-program-btn"]')

    // プログラム詳細ページに遷移
    await expect(page).toHaveURL(/\/rehab\/[a-z0-9-]+/)
    await expect(page.locator('[data-testid="program-title"]')).toContainText('ACL')
  })

  // -----------------------------------------------------------------------
  // フェーズステッパー
  // -----------------------------------------------------------------------

  test('フェーズステッパーが正しく表示される', async ({ page }) => {
    await page.goto('/rehab/test-program-id')

    // 4 フェーズのステッパー
    const phases = page.locator('[data-testid="phase-step"]')
    await expect(phases).toHaveCount(4)

    // 現在のフェーズがハイライトされている
    const activePhase = page.locator('[data-testid="phase-step"][data-active="true"]')
    await expect(activePhase).toHaveCount(1)

    // フェーズ名が表示される
    await expect(page.locator('[data-testid="phase-step"]').first()).toContainText(/Phase\s*1|フェーズ\s*1/i)
  })

  // -----------------------------------------------------------------------
  // AI メニュー生成
  // -----------------------------------------------------------------------

  test('AI メニュー生成ボタンでメニューが生成される', async ({ page }) => {
    await page.goto('/rehab/test-program-id')

    // AI メニュー生成ボタン
    const generateBtn = page.locator('[data-testid="generate-ai-menu"]')
    await expect(generateBtn).toBeVisible()
    await generateBtn.click()

    // ローディング表示
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible()

    // メニューが表示される（タイムアウト長め — AI 生成を待つ）
    await expect(page.locator('[data-testid="rehab-menu"]')).toBeVisible({ timeout: 30_000 })

    // エクササイズリストが存在する
    const exercises = page.locator('[data-testid="exercise-item"]')
    await expect(exercises.first()).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // ゲート承認（Leader ロール）
  // -----------------------------------------------------------------------

  test('Leader ロールでゲート承認ができる', async ({ page }) => {
    // Leader ロールでログインした状態を想定
    await page.goto('/rehab/test-program-id')

    // ゲート承認ボタンが表示される（Leader のみ）
    const gateBtn = page.locator('[data-testid="gate-approve-btn"]')
    await expect(gateBtn).toBeVisible()

    // 承認ダイアログ
    await gateBtn.click()
    const confirmDialog = page.locator('[data-testid="gate-confirm-dialog"]')
    await expect(confirmDialog).toBeVisible()

    // 確認ボタン
    await page.click('[data-testid="gate-confirm-yes"]')

    // フェーズが進行する
    await expect(page.locator('[data-testid="phase-step"][data-active="true"]')).toContainText(/Phase\s*2|フェーズ\s*2/i)
  })

  test('非 Leader ロールではゲート承認ボタンが表示されない', async ({ page }) => {
    // 通常スタッフでログインした状態を想定
    await page.goto('/rehab/test-program-id')

    // ゲート承認ボタンが非表示（または無効化）
    const gateBtn = page.locator('[data-testid="gate-approve-btn"]')
    const isVisible = await gateBtn.isVisible().catch(() => false)
    if (isVisible) {
      // 表示されていても disabled であること
      await expect(gateBtn).toBeDisabled()
    }
  })
})
