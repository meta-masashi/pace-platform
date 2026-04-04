/**
 * E2E Test: ログインURL完全分離（v1.3）
 * ============================================================
 * PACE Platform v1.3 で導入されたスタッフ/選手/管理者の
 * 3つのログインページ分離を検証する。
 *
 * テスト対象:
 *   - スタッフログイン: /login (旧) / /auth/login → /dashboard
 *   - 選手ログイン: /auth/athlete-login → /home
 *   - 管理者ログイン: /auth/admin-login → /platform-admin
 *   - クロスリンク誘導（選手→スタッフ、スタッフ→選手）
 *   - 未認証リダイレクト（保護ページへの直接アクセス）
 *
 * 前提:
 *   - 環境変数で各ロールのテストユーザー認証情報が設定されている
 *   - Supabase Auth が利用可能な状態
 * ============================================================
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// テストユーザー設定（環境変数から取得）
// ---------------------------------------------------------------------------

const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL ?? 'staff@pace-platform.test'
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD
if (!STAFF_PASSWORD) throw new Error('TEST_STAFF_PASSWORD env var is required')

const ATHLETE_EMAIL = process.env.TEST_ATHLETE_EMAIL ?? 'athlete@pace-platform.test'
const ATHLETE_PASSWORD = process.env.TEST_ATHLETE_PASSWORD
if (!ATHLETE_PASSWORD) throw new Error('TEST_ATHLETE_PASSWORD env var is required')

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@pace-platform.test'
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD
if (!ADMIN_PASSWORD) throw new Error('TEST_ADMIN_PASSWORD env var is required')

// ---------------------------------------------------------------------------
// ヘルパー: メール/パスワードでログイン（スタッフログインページ）
// ---------------------------------------------------------------------------

async function loginAsStaff(page: import('@playwright/test').Page) {
  await page.goto('/login')
  // メール/パスワードタブに切り替え
  await page.getByText('メール / パスワード').click()
  await page.fill('[data-testid="email-input"]', STAFF_EMAIL)
  await page.fill('[data-testid="password-input"]', STAFF_PASSWORD!)
  await page.click('[data-testid="login-button"]')
  await page.waitForURL('/dashboard', { timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// 1. スタッフログインフロー
// ---------------------------------------------------------------------------

test.describe('ログイン分離 -- スタッフログイン', () => {
  test('スタッフが /login でログイン → /dashboard に遷移する', async ({ page }) => {
    await page.goto('/login')

    // ログインページが正しく表示される
    await expect(page.getByText('PACE')).toBeVisible()

    // メール/パスワードタブに切り替え
    await page.getByText('メール / パスワード').click()
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible()

    // ログイン実行
    await page.fill('[data-testid="email-input"]', STAFF_EMAIL)
    await page.fill('[data-testid="password-input"]', STAFF_PASSWORD)
    await page.click('[data-testid="login-button"]')

    // ダッシュボードに遷移
    await expect(page).toHaveURL('/dashboard', { timeout: 15_000 })
  })

  test('スタッフログインページに「選手の方はこちら」リンクが表示される', async ({ page }) => {
    await page.goto('/login')

    const athleteLink = page.getByText('選手の方はこちら')
    await expect(athleteLink).toBeVisible()

    // リンク先が /auth/athlete-login であることを確認
    await expect(athleteLink).toHaveAttribute('href', '/auth/athlete-login')
  })

  test('マジックリンクタブがデフォルト表示される', async ({ page }) => {
    await page.goto('/login')

    // マジックリンクの案内テキストが表示される
    await expect(
      page.getByText('メールアドレスにログインリンクを送信します')
    ).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 2. 選手ログインフロー
// ---------------------------------------------------------------------------

test.describe('ログイン分離 -- 選手ログイン', () => {
  test('選手ログインページが正しく表示される', async ({ page }) => {
    await page.goto('/auth/athlete-login')

    // 選手ログインのタイトルが表示される
    await expect(page.getByText('選手ログイン')).toBeVisible()
    await expect(page.getByText('for Athletes')).toBeVisible()
  })

  test('選手ログインページに「スタッフの方はこちら」リンクが表示される', async ({ page }) => {
    await page.goto('/auth/athlete-login')

    const staffLink = page.getByText('スタッフの方はこちら')
    await expect(staffLink).toBeVisible()
  })

  test('選手ログインページに「新規登録（チームコード）」リンクが表示される', async ({ page }) => {
    await page.goto('/auth/athlete-login')

    const registerLink = page.getByText('新規登録（チームコード）')
    await expect(registerLink).toBeVisible()
    await expect(registerLink).toHaveAttribute('href', '/auth/athlete-register')
  })

  test('選手ログインページにマジックリンクフォームが表示される', async ({ page }) => {
    await page.goto('/auth/athlete-login')

    // ログインリンクを送信ボタンが表示される
    await expect(page.getByText('ログインリンクを送信')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 3. 管理者ログインフロー
// ---------------------------------------------------------------------------

test.describe('ログイン分離 -- 管理者ログイン', () => {
  test('管理者ログインページが正しく表示される', async ({ page }) => {
    await page.goto('/auth/admin-login')

    await expect(page.getByText('管理者ログイン')).toBeVisible()
    await expect(page.getByText('Platform Administration')).toBeVisible()
  })

  test('管理者ログインページにセキュリティ注記が表示される', async ({ page }) => {
    await page.goto('/auth/admin-login')

    await expect(
      page.getByText('この画面はプラットフォーム管理者専用です')
    ).toBeVisible()
  })

  test('管理者ログインページにスタッフ・選手へのリンクが表示される', async ({ page }) => {
    await page.goto('/auth/admin-login')

    await expect(page.getByText('スタッフの方')).toBeVisible()
    await expect(page.getByText('選手の方')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 4. 未認証ユーザーのリダイレクト
// ---------------------------------------------------------------------------

test.describe('ログイン分離 -- 未認証リダイレクト', () => {
  test('未認証ユーザーが /dashboard にアクセス → /login にリダイレクト', async ({
    page,
  }) => {
    await page.goto('/dashboard')

    // ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('未認証ユーザーが /home にアクセス → /auth/athlete-login にリダイレクト', async ({
    page,
  }) => {
    await page.goto('/home')

    // 選手ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/auth\/athlete-login/, { timeout: 10_000 })
  })

  test('未認証ユーザーが /platform-admin にアクセス → /auth/admin-login にリダイレクト', async ({
    page,
  }) => {
    await page.goto('/platform-admin')

    // 管理者ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/auth\/admin-login/, { timeout: 10_000 })
  })

  test('未認証ユーザーが /checkin にアクセス → /auth/athlete-login にリダイレクト', async ({
    page,
  }) => {
    await page.goto('/checkin')

    await expect(page).toHaveURL(/\/auth\/athlete-login/, { timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// 5. クロスURL アクセス検証（認証済みユーザー）
// ---------------------------------------------------------------------------

test.describe('ログイン分離 -- クロスURL アクセス', () => {
  test('スタッフが /auth/athlete-login にアクセス → /auth/login にリダイレクト', async ({
    page,
  }) => {
    // まずスタッフとしてログイン
    await loginAsStaff(page)

    // 選手ログインURLに手動アクセス
    await page.goto('/auth/athlete-login')

    // スタッフログインページまたはダッシュボードにリダイレクトされる
    await expect(page).toHaveURL(/\/(auth\/login|dashboard)/, {
      timeout: 10_000,
    })
  })
})

// ---------------------------------------------------------------------------
// 6. ページ固有の要素検証
// ---------------------------------------------------------------------------

test.describe('ログイン分離 -- ページ固有要素', () => {
  test('スタッフログインページに3つの認証タブが表示される', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByText('マジックリンク')).toBeVisible()
    await expect(page.getByText('Google')).toBeVisible()
    await expect(page.getByText('メール / パスワード')).toBeVisible()
  })

  test('選手ログインページに「はじめての方」セクションが表示される', async ({
    page,
  }) => {
    await page.goto('/auth/athlete-login')

    await expect(page.getByText('はじめての方')).toBeVisible()
  })

  test('管理者ログインページはダークテーマで表示される', async ({ page }) => {
    await page.goto('/auth/admin-login')

    // Slate/Dark テーマの背景要素が存在することを確認
    // (bg-slate-950 のコンテナが存在する)
    const darkBg = page.locator('.bg-slate-950, [class*="bg-slate-9"]')
    // ページにダークテーマ要素が少なくとも1つ存在する
    await expect(darkBg.first()).toBeVisible({ timeout: 5_000 })
  })
})
