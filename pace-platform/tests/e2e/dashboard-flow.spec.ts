/**
 * tests/e2e/dashboard-flow.spec.ts
 * ============================================================
 * スタッフダッシュボード E2E テスト
 *
 * テストシナリオ:
 *   1. /dashboard へ遷移
 *   2. 4 つの KPI カードの表示確認
 *   3. チャート（グラフ）のレンダリング確認
 *   4. チームセレクターの切り替え
 *
 * 注意: 実行サーバーが必要。CI ではスキップされる。
 * ============================================================
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// テストスイート（サーバー未起動のため skip）
// ---------------------------------------------------------------------------

test.describe('スタッフダッシュボード', () => {
  test.skip(true, 'サーバー未起動のためスキップ — npm run dev 実行後に有効化')

  test.beforeEach(async ({ page }) => {
    // ログイン状態のセットアップ
  })

  // -----------------------------------------------------------------------
  // ダッシュボード表示
  // -----------------------------------------------------------------------

  test('/dashboard に遷移できる', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  // -----------------------------------------------------------------------
  // KPI カード
  // -----------------------------------------------------------------------

  test('4 つの KPI カードが表示される', async ({ page }) => {
    await page.goto('/dashboard')

    const kpiCards = page.locator('[data-testid="kpi-card"]')
    await expect(kpiCards).toHaveCount(4)

    // 各カードに値が表示されている（空でない）
    for (let i = 0; i < 4; i++) {
      const card = kpiCards.nth(i)
      await expect(card).toBeVisible()
      const value = card.locator('[data-testid="kpi-value"]')
      await expect(value).not.toBeEmpty()
    }
  })

  test('KPI カードにチーム可用率が含まれる', async ({ page }) => {
    await page.goto('/dashboard')

    // チーム可用率カードを検索
    const availabilityCard = page.locator('[data-testid="kpi-card"]', {
      hasText: /可用率|Availability|プレー可能/i,
    })
    await expect(availabilityCard).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // チャート表示
  // -----------------------------------------------------------------------

  test('チャート（グラフ）がレンダリングされる', async ({ page }) => {
    await page.goto('/dashboard')

    // Recharts のコンテナ要素が存在する
    const charts = page.locator(
      '[data-testid="dashboard-chart"], .recharts-wrapper, .recharts-surface'
    )
    await expect(charts.first()).toBeVisible({ timeout: 10_000 })
  })

  test('コンディショニングスコアのトレンドチャートが表示される', async ({ page }) => {
    await page.goto('/dashboard')

    const trendChart = page.locator('[data-testid="conditioning-trend-chart"]')
    await expect(trendChart).toBeVisible({ timeout: 10_000 })
  })

  // -----------------------------------------------------------------------
  // チームセレクター
  // -----------------------------------------------------------------------

  test('チームセレクターでチームを切り替えられる', async ({ page }) => {
    await page.goto('/dashboard')

    // チームセレクターが存在する
    const teamSelect = page.locator('[data-testid="team-selector"]')
    await expect(teamSelect).toBeVisible()

    // セレクターを開いて別チームを選択
    await teamSelect.click()
    const options = page.locator('[data-testid="team-option"]')
    const optionCount = await options.count()

    if (optionCount > 1) {
      await options.nth(1).click()

      // KPI カードが更新される（ローディング → 再表示）
      await expect(page.locator('[data-testid="kpi-card"]').first()).toBeVisible({ timeout: 10_000 })
    }
  })

  test('チーム切り替え後もチャートが表示される', async ({ page }) => {
    await page.goto('/dashboard')

    const teamSelect = page.locator('[data-testid="team-selector"]')
    const options = page.locator('[data-testid="team-option"]')

    await teamSelect.click()
    const count = await options.count()
    if (count > 1) {
      await options.nth(1).click()
      // チャートが再レンダリングされる
      const charts = page.locator(
        '[data-testid="dashboard-chart"], .recharts-wrapper'
      )
      await expect(charts.first()).toBeVisible({ timeout: 10_000 })
    }
  })
})
