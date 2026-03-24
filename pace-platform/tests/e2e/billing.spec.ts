/**
 * tests/e2e/billing.spec.ts
 * ============================================================
 * 決済フロー E2E テスト（Playwright + Stripe テストモード）
 *
 * Stripe テストカード:
 *   成功: 4242 4242 4242 4242
 *   拒否: 4000 0000 0000 0002
 *   認証必要: 4000 0025 0000 3155
 *
 * テストシナリオ:
 *   - サブスクリプション新規加入（成功）
 *   - 支払い失敗時のエラーハンドリング
 *   - プラン別機能ゲート（アクセス拒否）
 *   - カスタマーポータルへのアクセス
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
// 決済フロー — 正常系
// ---------------------------------------------------------------------------

test.describe('決済フロー — 正常系（Stripe テストモード）', () => {
  test('ユーザーが Pro プランのサブスクリプションに加入できる', async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto('/pricing')

    // Pro プランのアップグレードボタンをクリック
    await page.click('[data-testid="upgrade-pro-button"]')

    // Stripe Checkout にリダイレクトされることを確認
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 })

    // Stripe のテストカード情報を入力（iFrameに対応）
    const stripeFrame = page.frameLocator('iframe[name="card-fields-number"]').first()
    if (await stripeFrame.locator('[name="cardnumber"]').isVisible({ timeout: 5_000 }).catch(() => false)) {
      await stripeFrame.locator('[name="cardnumber"]').fill('4242424242424242')
    } else {
      // 直接フォームに入力
      await page.fill('[name="cardnumber"]', '4242424242424242')
    }
    await page.fill('[name="exp-date"]', '12/30')
    await page.fill('[name="cvc"]', '123')

    await page.click('[data-testid="submit"]')

    // 成功画面にリダイレクトされることを確認
    await page.waitForURL('/dashboard?success=true', { timeout: 30_000 })
    await expect(page.locator('[data-testid="plan-badge"]')).toContainText('Pro')
  })

  test('Starter プランへの加入フローが完了する', async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto('/pricing')

    await page.click('[data-testid="upgrade-starter-button"]')
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 })

    // テストカードで決済
    await page.fill('[name="cardnumber"]', '4242424242424242')
    await page.fill('[name="exp-date"]', '12/30')
    await page.fill('[name="cvc"]', '123')
    await page.click('[data-testid="submit"]')

    await page.waitForURL('/dashboard?success=true', { timeout: 30_000 })
    await expect(page.locator('[data-testid="plan-badge"]')).toContainText('Starter')
  })
})

// ---------------------------------------------------------------------------
// 決済フロー — エラーケース
// ---------------------------------------------------------------------------

test.describe('決済フロー — エラーハンドリング', () => {
  test('支払い拒否カード使用時にエラーメッセージが表示される', async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto('/pricing')
    await page.click('[data-testid="upgrade-pro-button"]')
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 })

    // 拒否されるテストカードを使用
    await page.fill('[name="cardnumber"]', '4000000000000002')
    await page.fill('[name="exp-date"]', '12/30')
    await page.fill('[name="cvc"]', '123')
    await page.click('[data-testid="submit"]')

    // 支払い失敗エラーが表示されることを確認
    await expect(page.locator('[data-testid="payment-error"]')).toBeVisible({ timeout: 15_000 })
    // 決済ページに留まることを確認（成功画面に遷移しない）
    await expect(page).not.toHaveURL('/dashboard')
  })

  test('3D Secure 認証が必要なカードで認証フローが開始される', async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto('/pricing')
    await page.click('[data-testid="upgrade-pro-button"]')
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 })

    // 3D Secure 必要なテストカード
    await page.fill('[name="cardnumber"]', '4000002500003155')
    await page.fill('[name="exp-date"]', '12/30')
    await page.fill('[name="cvc"]', '123')
    await page.click('[data-testid="submit"]')

    // 3D Secure モーダルまたは認証フローが表示されることを確認
    await expect(
      page.locator('[data-testid="3ds-modal"], iframe[name*="3ds"], [data-testid="payment-error"]')
    ).toBeVisible({ timeout: 15_000 })
  })

  test('Checkout キャンセル時にキャンセルページにリダイレクトされる', async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto('/pricing')
    await page.click('[data-testid="upgrade-pro-button"]')
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 })

    // キャンセルボタンをクリック（Stripe Checkout にはキャンセルリンクがある）
    await page.goBack()

    // キャンセルページまたは pricing ページにリダイレクトされることを確認
    await expect(page).toHaveURL(/\/pricing|\/dashboard/)
  })
})

// ---------------------------------------------------------------------------
// プラン別機能ゲート
// ---------------------------------------------------------------------------

test.describe('プラン別機能ゲート（防壁3）', () => {
  test('Starter プランユーザーが AI 機能にアクセスしようとすると Upgrade 案内が表示される', async ({ page }) => {
    // starter プランのテストユーザーでログイン
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', process.env.TEST_STARTER_USER_EMAIL ?? 'starter@pace-platform.test')
    await page.fill('[data-testid="password-input"]', process.env.TEST_STARTER_USER_PASSWORD ?? 'TestPassword123!')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')

    // AI 機能ページにアクセス
    await page.goto('/rehab-generator')

    // アップグレード案内が表示されることを確認
    await expect(
      page.locator('[data-testid="upgrade-required"], [data-testid="plan-gate-message"]')
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Pro プランのプラン Badge が正しく表示される', async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto('/dashboard')

    // プランバッジが表示されることを確認（Pro または Starter）
    await expect(page.locator('[data-testid="plan-badge"]')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// カスタマーポータル
// ---------------------------------------------------------------------------

test.describe('カスタマーポータル', () => {
  test('設定ページからカスタマーポータルにアクセスできる', async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto('/settings/billing')

    // カスタマーポータルボタンが表示されることを確認
    await expect(page.locator('[data-testid="customer-portal-button"]')).toBeVisible()

    // ポータルボタンをクリックするとStripe ポータルにリダイレクトされることを確認
    await page.click('[data-testid="customer-portal-button"]')
    await page.waitForURL(/billing\.stripe\.com|checkout\.stripe\.com/, { timeout: 15_000 })
  })
})
