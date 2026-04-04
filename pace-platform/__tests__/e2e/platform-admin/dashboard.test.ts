/**
 * E2E Test: Platform Admin 管理画面（v1.3 P1-P7）
 * ============================================================
 * プラットフォーム管理者専用ダッシュボード（P1-P7）の各画面を検証。
 *
 * テスト対象:
 *   P1: KPIカード5枚（契約チーム数, MRR, 未払い, エラー, 利用率）
 *   P2: 決済テーブル + MRRチャート（/platform-admin/billing）
 *   P3: チーム一覧 + プラン変更タブ切替（/platform-admin/teams）
 *   P4: エラー率チャート + エラー一覧（/platform-admin/errors）
 *   P5: エンジン監視画面（/platform-admin/engine）
 *   P6: 利用率チャート + テーブル（/platform-admin/usage）
 *   P7: エンジン成長率（/platform-admin/engine-growth）
 *   アクセス制御: 非platform_adminユーザーの拒否
 *
 * 前提:
 *   - platform_admin ロールのテストユーザーが存在する
 *   - 非管理者テストユーザーが存在する
 * ============================================================
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// テストユーザー設定
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@pace-platform.test'
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD
if (!ADMIN_PASSWORD) throw new Error('TEST_ADMIN_PASSWORD env var is required')

const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL ?? 'staff@pace-platform.test'
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD
if (!STAFF_PASSWORD) throw new Error('TEST_STAFF_PASSWORD env var is required')

// ---------------------------------------------------------------------------
// ヘルパー: platform_admin としてログイン
// ---------------------------------------------------------------------------

async function loginAsAdmin(page: import('@playwright/test').Page) {
  // 管理者ログインページは MagicLink ベースだが、テスト環境では
  // 直接 /login からメール/パスワードでログインし、
  // middleware が /platform-admin にリダイレクトする想定。
  // または直接セッション設定を使用。
  await page.goto('/login')
  await page.getByText('メール / パスワード').click()
  await page.fill('[data-testid="email-input"]', ADMIN_EMAIL)
  await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD!)
  await page.click('[data-testid="login-button"]')
  // 管理者はダッシュボードまたは platform-admin にリダイレクトされる
  await page.waitForURL(/\/(dashboard|platform-admin)/, { timeout: 15_000 })
  // platform-admin に遷移
  if (!page.url().includes('/platform-admin')) {
    await page.goto('/platform-admin')
  }
  await page.waitForURL(/\/platform-admin/, { timeout: 15_000 })
}

async function loginAsStaff(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByText('メール / パスワード').click()
  await page.fill('[data-testid="email-input"]', STAFF_EMAIL)
  await page.fill('[data-testid="password-input"]', STAFF_PASSWORD!)
  await page.click('[data-testid="login-button"]')
  await page.waitForURL('/dashboard', { timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// P1: ダッシュボード KPI カード
// ---------------------------------------------------------------------------

test.describe('Platform Admin -- P1: ダッシュボード', () => {
  test('ダッシュボードページが表示される', async ({ page }) => {
    await loginAsAdmin(page)

    // ダッシュボードタイトルが表示される
    await expect(page.getByText('ダッシュボード')).toBeVisible({ timeout: 10_000 })
  })

  test('KPIカード5枚が表示される', async ({ page }) => {
    await loginAsAdmin(page)

    // 5つのKPIカードタイトルが表示される
    await expect(page.getByText('契約チーム数')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('MRR')).toBeVisible()
    await expect(page.getByText('未払いアラート')).toBeVisible()
    await expect(page.getByText('エラー件数')).toBeVisible()
    await expect(page.getByText('全体利用率')).toBeVisible()
  })

  test('未払いアラート（直近）セクションが表示される', async ({ page }) => {
    await loginAsAdmin(page)

    await expect(page.getByText('未払いアラート（直近）')).toBeVisible({ timeout: 10_000 })
    // 「決済状況を見る」リンクが表示される
    await expect(page.getByText('決済状況を見る')).toBeVisible()
  })

  test('最近のエラーセクションが表示される', async ({ page }) => {
    await loginAsAdmin(page)

    await expect(page.getByText('最近のエラー')).toBeVisible({ timeout: 10_000 })
    // 「エラー一覧を見る」リンクが表示される
    await expect(page.getByText('エラー一覧を見る')).toBeVisible()
  })

  test('MRR推移チャートが表示される', async ({ page }) => {
    await loginAsAdmin(page)

    await expect(page.getByText('MRR推移')).toBeVisible({ timeout: 10_000 })
  })

  test('サイドバーが表示される', async ({ page }) => {
    await loginAsAdmin(page)

    // AdminSidebar のナビゲーション要素が表示される
    // サイドバーのリンク先ページ名が存在する
    await expect(page.locator('nav, aside, [role="navigation"]').first()).toBeVisible({
      timeout: 10_000,
    })
  })
})

// ---------------------------------------------------------------------------
// P2: 決済状況
// ---------------------------------------------------------------------------

test.describe('Platform Admin -- P2: 決済状況', () => {
  test('決済状況ページが表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/billing')

    // ページヘッダーが表示される（AdminHeader コンポーネント）
    await page.waitForLoadState('networkidle')
    // 決済関連の要素が表示される
    await expect(page.locator('body')).toContainText(/決済|MRR|billing/i, {
      timeout: 10_000,
    })
  })

  test('決済テーブルが表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/billing')

    // テーブルまたはデータテーブルが存在する
    await expect(
      page.locator('table, [role="table"], [data-testid*="table"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// P3: 契約チーム + プラン管理
// ---------------------------------------------------------------------------

test.describe('Platform Admin -- P3: 契約チーム + プラン管理', () => {
  test('チーム一覧ページが表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/teams')

    await expect(page.getByText('契約チーム + プラン管理')).toBeVisible({
      timeout: 10_000,
    })
  })

  test('タブが4つ表示される（チーム一覧・保留中・承認済み・却下）', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/teams')

    await expect(page.getByText('チーム一覧')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('保留中')).toBeVisible()
    await expect(page.getByText('承認済み')).toBeVisible()
    await expect(page.getByText('却下')).toBeVisible()
  })

  test('チーム一覧タブにテーブルカラムが表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/teams')

    // テーブルヘッダーカラム
    await expect(page.getByText('組織名')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('プラン')).toBeVisible()
    await expect(page.getByText('スタッフ数')).toBeVisible()
    await expect(page.getByText('選手数')).toBeVisible()
  })

  test('保留中タブに切り替えてプラン変更依頼が表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/teams')

    // 保留中タブをクリック
    await page.getByText('保留中').click()

    // プラン変更依頼のカラムが表示される
    await expect(page.getByText('現在のプラン').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('変更先プラン').first()).toBeVisible()
  })

  test('承認済みタブに切り替えられる', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/teams')

    await page.getByText('承認済み').click()
    // ステータスカラムが表示される
    await expect(page.getByText('ステータス')).toBeVisible({ timeout: 5_000 })
  })

  test('却下タブに切り替えられる', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/teams')

    await page.getByText('却下').click()
    await expect(page.getByText('ステータス')).toBeVisible({ timeout: 5_000 })
  })
})

// ---------------------------------------------------------------------------
// P4: システムエラー
// ---------------------------------------------------------------------------

test.describe('Platform Admin -- P4: システムエラー', () => {
  test('エラーページが表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/errors')

    // ページヘッダーが表示される
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(/エラー|error/i, {
      timeout: 10_000,
    })
  })

  test('エラー率チャートが存在する', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/errors')

    // AdminChart コンポーネントまたは canvas/svg が存在する
    await expect(
      page.locator('canvas, svg, [data-testid*="chart"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('エラーテーブルが存在する', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/errors')

    await expect(
      page.locator('table, [role="table"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// P5: 推論エンジン監視
// ---------------------------------------------------------------------------

test.describe('Platform Admin -- P5: 推論エンジン監視', () => {
  test('エンジン監視ページが表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/engine')

    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(/エンジン|engine/i, {
      timeout: 10_000,
    })
  })

  test('レイテンシ情報が表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/engine')

    // p50, p95, p99 のいずれかが表示される
    await expect(
      page.getByText(/p50|p95|p99|P50|P95|P99/).first()
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// P6: 利用率
// ---------------------------------------------------------------------------

test.describe('Platform Admin -- P6: 利用率', () => {
  test('利用率ページが表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/usage')

    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(/利用|usage|DAU|MAU/i, {
      timeout: 10_000,
    })
  })

  test('利用率テーブルが存在する', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/usage')

    await expect(
      page.locator('table, [role="table"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// P7: エンジン成長率
// ---------------------------------------------------------------------------

test.describe('Platform Admin -- P7: エンジン成長率', () => {
  test('エンジン成長率ページが表示される', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/engine-growth')

    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(/成長|growth|データ品質/i, {
      timeout: 10_000,
    })
  })

  test('データ品質テーブルが存在する', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/platform-admin/engine-growth')

    await expect(
      page.locator('table, [role="table"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// アクセス制御: 非 platform_admin ユーザーの拒否
// ---------------------------------------------------------------------------

test.describe('Platform Admin -- アクセス制御', () => {
  test('非管理者ユーザーが /platform-admin にアクセスするとリダイレクトされる', async ({
    page,
  }) => {
    await loginAsStaff(page)

    // platform-admin にアクセス試行
    await page.goto('/platform-admin')

    // /auth/login または /dashboard にリダイレクトされる（管理者ではないため）
    await expect(page).not.toHaveURL(/\/platform-admin/, { timeout: 10_000 })
  })

  test('非管理者ユーザーが /platform-admin/billing にアクセスするとリダイレクトされる', async ({
    page,
  }) => {
    await loginAsStaff(page)

    await page.goto('/platform-admin/billing')

    await expect(page).not.toHaveURL(/\/platform-admin/, { timeout: 10_000 })
  })

  test('非管理者ユーザーが /platform-admin/teams にアクセスするとリダイレクトされる', async ({
    page,
  }) => {
    await loginAsStaff(page)

    await page.goto('/platform-admin/teams')

    await expect(page).not.toHaveURL(/\/platform-admin/, { timeout: 10_000 })
  })

  test('未認証ユーザーが /platform-admin にアクセスすると /auth/admin-login にリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/platform-admin')

    await expect(page).toHaveURL(/\/auth\/admin-login/, { timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// ナビゲーション検証
// ---------------------------------------------------------------------------

test.describe('Platform Admin -- サイドバーナビゲーション', () => {
  test('ダッシュボードから決済状況ページに遷移できる', async ({ page }) => {
    await loginAsAdmin(page)

    // 「決済状況を見る」リンクをクリック
    await page.getByText('決済状況を見る').click()

    await expect(page).toHaveURL(/\/platform-admin\/billing/, {
      timeout: 10_000,
    })
  })

  test('ダッシュボードからエラー一覧ページに遷移できる', async ({ page }) => {
    await loginAsAdmin(page)

    await page.getByText('エラー一覧を見る').click()

    await expect(page).toHaveURL(/\/platform-admin\/errors/, {
      timeout: 10_000,
    })
  })
})
