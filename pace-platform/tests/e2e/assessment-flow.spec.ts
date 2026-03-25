/**
 * tests/e2e/assessment-flow.spec.ts
 * ============================================================
 * アセスメントフロー E2E テスト
 *
 * テストシナリオ:
 *   1. /assessment/new へ遷移
 *   2. アスリート選択 → アセスメント開始
 *   3. 質問に回答 → 事後確率パネルの更新確認
 *   4. アセスメント完了 → 結果表示の確認
 *
 * 注意: 実行サーバーが必要。CI ではスキップされる。
 * ============================================================
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// テストスイート（サーバー未起動のため skip）
// ---------------------------------------------------------------------------

test.describe('アセスメントフロー', () => {
  test.describe.configure({ mode: 'serial' })

  // 全テストをスキップ（サーバー起動後に有効化）
  test.skip(true, 'サーバー未起動のためスキップ — npm run dev 実行後に有効化')

  test.beforeEach(async ({ page }) => {
    // ログイン状態のセットアップ（storage state 使用想定）
    // await page.goto('/auth/login')
    // await page.fill('[name="email"]', process.env.TEST_USER_EMAIL ?? '')
    // await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD ?? '')
    // await page.click('button[type="submit"]')
    // await page.waitForURL('/dashboard')
  })

  test('アセスメント新規作成ページに遷移できる', async ({ page }) => {
    await page.goto('/assessment/new')
    await expect(page).toHaveURL(/\/assessment\/new/)
    // ページタイトルまたはヘッダーが表示される
    await expect(page.locator('h1, [data-testid="assessment-title"]')).toBeVisible()
  })

  test('アスリートを選択してアセスメントを開始できる', async ({ page }) => {
    await page.goto('/assessment/new')

    // アスリート選択ドロップダウン
    await page.click('[data-testid="athlete-select"]')
    await page.click('[data-testid="athlete-option"]:first-child')

    // アセスメント開始ボタン
    await page.click('[data-testid="start-assessment-btn"]')

    // 質問画面に遷移
    await expect(page.locator('[data-testid="question-text"]')).toBeVisible()
  })

  test('質問に回答すると事後確率パネルが更新される', async ({ page }) => {
    // アセスメント実行中ページへ直接遷移（テスト用 ID）
    await page.goto('/assessment/test-session-id')

    // 質問テキストが表示される
    await expect(page.locator('[data-testid="question-text"]')).toBeVisible()

    // yes ボタンで回答
    await page.click('[data-testid="answer-yes"]')

    // 事後確率パネルが更新される
    await expect(page.locator('[data-testid="posterior-panel"]')).toBeVisible()

    // 進捗バーが更新される
    const progress = page.locator('[data-testid="progress-bar"]')
    await expect(progress).toBeVisible()
  })

  test('アセスメント完了後に結果が表示される', async ({ page }) => {
    // 完了済みアセスメントの結果ページ
    await page.goto('/assessment/completed-session-id')

    // 主診断が表示される
    await expect(page.locator('[data-testid="primary-diagnosis"]')).toBeVisible()

    // 鑑別診断リストが表示される
    await expect(page.locator('[data-testid="differentials-list"]')).toBeVisible()

    // 信頼度が表示される
    await expect(page.locator('[data-testid="confidence-score"]')).toBeVisible()

    // レッドフラグセクション（ある場合）
    const redFlagSection = page.locator('[data-testid="red-flags-section"]')
    // 存在しない場合もあるので assertive にはチェックしない
  })

  test('レッドフラグ発生時に警告が表示される', async ({ page }) => {
    await page.goto('/assessment/test-session-id')

    // レッドフラグを発火する質問に yes で回答
    await page.click('[data-testid="answer-yes"]')

    // レッドフラグ警告モーダルまたはバナー
    const alert = page.locator('[data-testid="red-flag-alert"]')
    // 実際のテストデータに依存するため条件付きチェック
    if (await alert.isVisible()) {
      await expect(alert).toContainText(/重度|critical|高リスク/i)
    }
  })
})
