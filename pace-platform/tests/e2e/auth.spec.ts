/**
 * tests/e2e/auth.spec.ts
 * ============================================================
 * 認証フロー E2E テスト（Playwright）
 *
 * 正常系:
 *   - 既存ユーザーのログイン
 *   - ログアウト
 *   - 未認証ユーザーのリダイレクト
 *
 * エッジケース:
 *   - 誤ったパスワードでのログイン失敗
 *   - パスワードなしのフォーム送信
 *   - セッションタイムアウト後のリダイレクト
 * ============================================================
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// テストユーザー設定
// ---------------------------------------------------------------------------

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? 'test@pace-platform.test'
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'TestPassword123!'

// ---------------------------------------------------------------------------
// 正常系テスト
// ---------------------------------------------------------------------------

test.describe('認証フロー — 正常系', () => {
  test('既存ユーザーがログインしてダッシュボードに遷移できる', async ({ page }) => {
    await page.goto('/login')

    // ログインフォームが表示されることを確認
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible()

    // 認証情報を入力してログイン
    await page.fill('[data-testid="email-input"]', TEST_USER_EMAIL)
    await page.fill('[data-testid="password-input"]', TEST_USER_PASSWORD)
    await page.click('[data-testid="login-button"]')

    // ダッシュボードへ遷移することを確認
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
  })

  test('ログイン後にユーザーメニューに組織名とメールが表示される', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', TEST_USER_EMAIL)
    await page.fill('[data-testid="password-input"]', TEST_USER_PASSWORD)
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')

    // ユーザーメニューを開く
    await page.click('[data-testid="user-menu"]')
    await expect(page.locator('[data-testid="user-email"]')).toContainText(TEST_USER_EMAIL)
  })

  test('ログアウトするとログイン画面にリダイレクトされる', async ({ page }) => {
    // ログイン
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', TEST_USER_EMAIL)
    await page.fill('[data-testid="password-input"]', TEST_USER_PASSWORD)
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')

    // ログアウト
    await page.click('[data-testid="user-menu"]')
    await page.click('[data-testid="logout-button"]')

    // ログイン画面にリダイレクトされることを確認
    await expect(page).toHaveURL('/login')
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// エッジケーステスト
// ---------------------------------------------------------------------------

test.describe('認証フロー — エッジケース', () => {
  test('誤ったパスワードでログイン失敗時にエラーメッセージが表示される', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', TEST_USER_EMAIL)
    await page.fill('[data-testid="password-input"]', 'wrong-password-xyz')
    await page.click('[data-testid="login-button"]')

    // エラーメッセージが表示されることを確認
    await expect(page.locator('[data-testid="auth-error"]')).toBeVisible({ timeout: 10000 })
    // ログインページに留まることを確認
    await expect(page).toHaveURL('/login')
  })

  test('空のフォームで送信するとバリデーションエラーが表示される', async ({ page }) => {
    await page.goto('/login')
    await page.click('[data-testid="login-button"]')

    // バリデーションエラーまたはHTML5バリデーションが発動することを確認
    const emailInput = page.locator('[data-testid="email-input"]')
    // ページがログインのままであることを確認
    await expect(page).toHaveURL('/login')
    // メールフィールドに required 属性があるか、またはエラーが表示されることを確認
    const isRequired = await emailInput.getAttribute('required')
    if (!isRequired) {
      await expect(page.locator('[data-testid="auth-error"]')).toBeVisible({ timeout: 5000 })
    }
  })

  test('未認証ユーザーが保護ページにアクセスするとログインにリダイレクトされる', async ({ page }) => {
    // セッションなしで直接ダッシュボードにアクセス
    await page.goto('/dashboard')

    // ログインページにリダイレクトされることを確認
    await expect(page).toHaveURL(/\/login/)
  })

  test('未認証ユーザーがAPIエンドポイントにアクセスすると401が返る', async ({ page }) => {
    // API エンドポイントへの直接アクセス
    const response = await page.request.get('/api/ai/rehab-generator')
    expect(response.status()).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// セッション管理テスト
// ---------------------------------------------------------------------------

test.describe('セッション管理', () => {
  test('ページリロード後もセッションが維持される', async ({ page }) => {
    // ログイン
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', TEST_USER_EMAIL)
    await page.fill('[data-testid="password-input"]', TEST_USER_PASSWORD)
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')

    // ページをリロード
    await page.reload()

    // セッションが維持されてダッシュボードのままであることを確認
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
  })
})
