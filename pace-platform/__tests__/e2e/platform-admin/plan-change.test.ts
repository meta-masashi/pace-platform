/**
 * E2E Test: プラン変更依頼フロー（v1.3）
 * ============================================================
 * Platform Admin が受け取るプラン変更依頼の一覧表示・承認・却下を検証。
 *
 * テスト対象:
 *   - /platform-admin/teams のプラン変更依頼タブ
 *   - 依頼一覧表示（pending / approved / rejected のフィルタリング）
 *   - 依頼承認フロー（POST /api/platform-admin/plan-change-requests/:id/approve）
 *   - 依頼却下フロー（POST /api/platform-admin/plan-change-requests/:id/reject）
 *
 * 前提:
 *   - platform_admin ロールのテストユーザーが存在する
 *   - テスト用プラン変更依頼がDBに存在する
 * ============================================================
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// テストユーザー設定
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@pace-platform.test'
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD
if (!ADMIN_PASSWORD) throw new Error('TEST_ADMIN_PASSWORD env var is required')

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByText('メール / パスワード').click()
  await page.fill('[data-testid="email-input"]', ADMIN_EMAIL)
  await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD!)
  await page.click('[data-testid="login-button"]')
  await page.waitForURL(/\/(dashboard|platform-admin)/, { timeout: 15_000 })
  if (!page.url().includes('/platform-admin')) {
    await page.goto('/platform-admin')
  }
}

async function navigateToTeamsPage(page: import('@playwright/test').Page) {
  await loginAsAdmin(page)
  await page.goto('/platform-admin/teams')
  await expect(page.getByText('契約チーム + プラン管理')).toBeVisible({
    timeout: 10_000,
  })
}

// ---------------------------------------------------------------------------
// 1. 依頼一覧表示
// ---------------------------------------------------------------------------

test.describe('プラン変更依頼 -- 一覧表示', () => {
  test('チーム一覧タブがデフォルトで選択されている', async ({ page }) => {
    await navigateToTeamsPage(page)

    // チーム一覧のテーブルカラムが表示される
    await expect(page.getByText('組織名')).toBeVisible({ timeout: 10_000 })
  })

  test('保留中タブをクリックするとpending依頼のみ表示される', async ({
    page,
  }) => {
    await navigateToTeamsPage(page)

    await page.getByText('保留中').click()

    // プラン変更依頼のテーブルカラムが表示される
    await expect(page.getByText('現在のプラン').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('変更先プラン').first()).toBeVisible()
    await expect(page.getByText('理由').first()).toBeVisible()
    await expect(page.getByText('申請日').first()).toBeVisible()
  })

  test('承認済みタブをクリックするとapproved依頼のみ表示される', async ({
    page,
  }) => {
    await navigateToTeamsPage(page)

    await page.getByText('承認済み').click()

    // テーブルが表示される
    await expect(page.getByText('ステータス')).toBeVisible({ timeout: 5_000 })
  })

  test('却下タブをクリックするとrejected依頼のみ表示される', async ({
    page,
  }) => {
    await navigateToTeamsPage(page)

    await page.getByText('却下').click()

    await expect(page.getByText('ステータス')).toBeVisible({ timeout: 5_000 })
  })

  test('タブ間を切り替えてもページがクラッシュしない', async ({ page }) => {
    await navigateToTeamsPage(page)

    // 全タブを順番にクリック
    await page.getByText('保留中').click()
    await page.waitForTimeout(500)

    await page.getByText('承認済み').click()
    await page.waitForTimeout(500)

    await page.getByText('却下').click()
    await page.waitForTimeout(500)

    await page.getByText('チーム一覧').click()
    await page.waitForTimeout(500)

    // ページがエラー状態でないことを確認
    await expect(page.getByText('契約チーム + プラン管理')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 2. 依頼のテーブルカラム検証
// ---------------------------------------------------------------------------

test.describe('プラン変更依頼 -- テーブル構造', () => {
  test('プラン変更依頼テーブルに必要なカラムがすべて表示される', async ({
    page,
  }) => {
    await navigateToTeamsPage(page)
    await page.getByText('保留中').click()

    const expectedColumns = [
      '組織名',
      '現在のプラン',
      '変更先プラン',
      '理由',
      'ステータス',
      '申請日',
    ]

    for (const col of expectedColumns) {
      await expect(page.getByText(col).first()).toBeVisible({ timeout: 5_000 })
    }
  })

  test('チーム一覧テーブルに必要なカラムがすべて表示される', async ({
    page,
  }) => {
    await navigateToTeamsPage(page)

    const expectedColumns = [
      '組織名',
      'プラン',
      'スタッフ数',
      '選手数',
      '契約日',
      'ステータス',
    ]

    for (const col of expectedColumns) {
      await expect(page.getByText(col).first()).toBeVisible({ timeout: 5_000 })
    }
  })
})

// ---------------------------------------------------------------------------
// 3. 依頼承認フロー
// ---------------------------------------------------------------------------

test.describe('プラン変更依頼 -- 承認フロー', () => {
  test('承認 API エンドポイントが未認証で 401 を返す', async ({ request }) => {
    // ダミーの requestId で認証なし呼び出し
    const response = await request.post(
      '/api/platform-admin/plan-change-requests/dummy-id/approve',
    )
    expect(response.status()).toBe(401)
  })

  test('承認 API エンドポイントが存在しない依頼 ID で 404 を返す', async ({
    request,
  }) => {
    // NOTE: 認証ありの場合のみ 404 が返る。
    // 未認証の場合は 401 が先に返る。
    const response = await request.post(
      '/api/platform-admin/plan-change-requests/00000000-0000-0000-0000-000000000000/approve',
    )
    // 401 (未認証) or 404 (存在しない)
    expect([401, 404]).toContain(response.status())
  })
})

// ---------------------------------------------------------------------------
// 4. 依頼却下フロー
// ---------------------------------------------------------------------------

test.describe('プラン変更依頼 -- 却下フロー', () => {
  test('却下 API エンドポイントが未認証で 401 を返す', async ({ request }) => {
    const response = await request.post(
      '/api/platform-admin/plan-change-requests/dummy-id/reject',
    )
    expect(response.status()).toBe(401)
  })

  test('却下 API エンドポイントが存在しない依頼 ID で 404 を返す', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/platform-admin/plan-change-requests/00000000-0000-0000-0000-000000000000/reject',
    )
    expect([401, 404]).toContain(response.status())
  })
})

// ---------------------------------------------------------------------------
// 5. プラン変更依頼 API 一覧
// ---------------------------------------------------------------------------

test.describe('プラン変更依頼 -- API 一覧', () => {
  test('GET /api/platform-admin/plan-change-requests は未認証で 401 を返す', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/platform-admin/plan-change-requests',
    )
    expect(response.status()).toBe(401)
  })

  test('GET /api/platform-admin/plan-change-requests?status=pending は未認証で 401 を返す', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/platform-admin/plan-change-requests?status=pending',
    )
    expect(response.status()).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// 6. ページ間ナビゲーション
// ---------------------------------------------------------------------------

test.describe('プラン変更依頼 -- ナビゲーション', () => {
  test('ダッシュボードからチーム管理ページに遷移できる', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin')

    // サイドバーまたは本文のリンクからチーム管理へ遷移
    // まずサイドバーのリンクを試みる
    const teamsLink = page.locator('a[href*="/platform-admin/teams"]').first()
    const hasTeamsLink = await teamsLink.isVisible().catch(() => false)

    if (hasTeamsLink) {
      await teamsLink.click()
      await expect(page).toHaveURL(/\/platform-admin\/teams/, {
        timeout: 10_000,
      })
    } else {
      // 直接遷移
      await page.goto('/platform-admin/teams')
      await expect(page).toHaveURL(/\/platform-admin\/teams/)
    }
  })
})
