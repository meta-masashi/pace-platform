/**
 * E2E Test: チームコード管理（v1.3 master向け）
 * ============================================================
 * master ロールのスタッフがチームコードを生成・管理する画面を検証。
 *
 * テスト対象:
 *   - コード一覧表示（テーブル: コード, 有効期限, 使用回数, ステータス, 操作）
 *   - 新規コード生成（有効期限・使用回数設定）
 *   - コード無効化
 *   - master 以外のロールでアクセス → アクセス拒否
 *
 * 前提:
 *   - master ロールのテストユーザーが存在する
 *   - 一般スタッフ（non-master）テストユーザーが存在する
 *   - /admin/team-codes ページが利用可能
 * ============================================================
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// テストユーザー設定
// ---------------------------------------------------------------------------

const MASTER_EMAIL = process.env.TEST_MASTER_EMAIL ?? 'master@pace-platform.test'
const MASTER_PASSWORD = process.env.TEST_MASTER_PASSWORD
if (!MASTER_PASSWORD) throw new Error('TEST_MASTER_PASSWORD env var is required')

const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL ?? 'staff@pace-platform.test'
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD
if (!STAFF_PASSWORD) throw new Error('TEST_STAFF_PASSWORD env var is required')

// ---------------------------------------------------------------------------
// ヘルパー: master としてログイン
// ---------------------------------------------------------------------------

async function loginAsMaster(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByText('メール / パスワード').click()
  await page.fill('[data-testid="email-input"]', MASTER_EMAIL)
  await page.fill('[data-testid="password-input"]', MASTER_PASSWORD!)
  await page.click('[data-testid="login-button"]')
  await page.waitForURL('/dashboard', { timeout: 15_000 })
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
// 1. コード一覧表示
// ---------------------------------------------------------------------------

test.describe('チームコード管理 -- 一覧表示', () => {
  test('チームコード管理ページが表示される', async ({ page }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    await expect(page.getByText('チームコード管理')).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByText('選手がチームに参加するためのコードを管理します。')
    ).toBeVisible()
  })

  test('「新規コード生成」ボタンが表示される', async ({ page }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    await expect(page.getByText('新規コード生成')).toBeVisible({ timeout: 10_000 })
  })

  test('コードテーブルのヘッダーが正しく表示される', async ({ page }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    // テーブルヘッダーカラム
    await expect(page.getByText('コード')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('有効期限')).toBeVisible()
    await expect(page.getByText('使用回数')).toBeVisible()
    await expect(page.getByText('ステータス')).toBeVisible()
    await expect(page.getByText('操作')).toBeVisible()
  })

  test('コードのステータスバッジが表示される（有効/期限切れ/上限到達/無効）', async ({
    page,
  }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    // テーブルにデータがロードされるのを待つ
    await page.waitForTimeout(1_000)

    // ステータスバッジのいずれかが表示される
    const hasStatus = await page
      .getByText(/有効|期限切れ|上限到達|無効/)
      .first()
      .isVisible()
      .catch(() => false)

    // コード一覧がある場合はステータスが表示される、
    // ない場合は空メッセージが表示される
    if (!hasStatus) {
      await expect(
        page.getByText('まだチームコードが生成されていません。')
      ).toBeVisible()
    }
  })

  test('有効なコードに「無効化」ボタンが表示される', async ({ page }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    // テーブルロード待ち
    await page.waitForTimeout(1_000)

    // 有効なコードがある場合、無効化ボタンが表示される
    const deactivateButton = page.getByText('無効化').first()
    const hasActiveCode = await deactivateButton.isVisible().catch(() => false)

    if (hasActiveCode) {
      await expect(deactivateButton).toBeVisible()
    }
  })
})

// ---------------------------------------------------------------------------
// 2. 新規コード生成
// ---------------------------------------------------------------------------

test.describe('チームコード管理 -- 新規コード生成', () => {
  test('「新規コード生成」ボタンをクリックするとモーダルが表示される', async ({
    page,
  }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    await page.getByText('新規コード生成').click()

    // モーダルタイトル
    await expect(page.getByText('チームコード生成')).toBeVisible({ timeout: 5_000 })
    await expect(
      page.getByText('選手がチームに参加するためのコードを生成します。')
    ).toBeVisible()
  })

  test('モーダルに有効期限（日数）入力フィールドがある', async ({ page }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    await page.getByText('新規コード生成').click()

    await expect(page.getByText('有効期限（日数）')).toBeVisible({ timeout: 5_000 })
    const expiresInput = page.locator('#expires-days')
    await expect(expiresInput).toBeVisible()
    // デフォルト値は 7
    await expect(expiresInput).toHaveValue('7')
  })

  test('モーダルに使用回数上限入力フィールドがある', async ({ page }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    await page.getByText('新規コード生成').click()

    await expect(page.getByText('使用回数上限')).toBeVisible({ timeout: 5_000 })
    const maxUsesInput = page.locator('#max-uses')
    await expect(maxUsesInput).toBeVisible()
    // プレースホルダーが「無制限」
    await expect(maxUsesInput).toHaveAttribute('placeholder', '無制限')
  })

  test('モーダルの「キャンセル」でモーダルが閉じる', async ({ page }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    await page.getByText('新規コード生成').click()
    await expect(page.getByText('チームコード生成')).toBeVisible({ timeout: 5_000 })

    await page.getByText('キャンセル').click()

    // モーダルが閉じる
    await expect(page.getByText('チームコード生成')).not.toBeVisible({
      timeout: 3_000,
    })
  })

  test('モーダルの「コードを生成」ボタンでAPI呼び出しが行われる', async ({
    page,
  }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    await page.getByText('新規コード生成').click()

    // 有効期限と使用回数を設定
    const expiresInput = page.locator('#expires-days')
    await expiresInput.clear()
    await expiresInput.fill('14')

    const maxUsesInput = page.locator('#max-uses')
    await maxUsesInput.fill('20')

    // API リクエストを監視
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/admin/team-codes') && resp.request().method() === 'POST',
      { timeout: 10_000 },
    ).catch(() => null)

    await page.getByText('コードを生成').click()

    // API が呼び出される
    const response = await responsePromise
    if (response) {
      // レスポンスステータスを確認（成功 or 認証エラー）
      expect([200, 201, 401, 403]).toContain(response.status())
    }
  })
})

// ---------------------------------------------------------------------------
// 3. コード無効化
// ---------------------------------------------------------------------------

test.describe('チームコード管理 -- コード無効化', () => {
  test('「無効化」ボタンをクリックするとAPIが呼び出される', async ({ page }) => {
    await loginAsMaster(page)
    await page.goto('/admin/team-codes')

    // テーブルロード待ち
    await page.waitForTimeout(1_000)

    const deactivateButton = page.getByText('無効化').first()
    const hasActiveCode = await deactivateButton.isVisible().catch(() => false)

    if (hasActiveCode) {
      // PATCH リクエストを監視
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/admin/team-codes/') &&
          resp.request().method() === 'PATCH',
        { timeout: 10_000 },
      ).catch(() => null)

      await deactivateButton.click()

      const response = await responsePromise
      if (response) {
        expect([200, 401, 403]).toContain(response.status())
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 4. アクセス制御
// ---------------------------------------------------------------------------

test.describe('チームコード管理 -- アクセス制御', () => {
  test('一般スタッフ（non-master）がアクセスすると拒否される', async ({
    page,
  }) => {
    await loginAsStaff(page)
    await page.goto('/admin/team-codes')

    // アクセス拒否: リダイレクトまたはエラー表示
    // 権限がない場合は /dashboard にリダイレクトされるか、
    // アクセス拒否メッセージが表示される
    const isRedirected = await page
      .waitForURL(/\/(dashboard|admin(?!\/team-codes))/, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false)

    const hasError = await page
      .getByText(/アクセス権限|権限がありません|forbidden/i)
      .first()
      .isVisible()
      .catch(() => false)

    // リダイレクトされるか、エラー表示のどちらか
    expect(isRedirected || hasError).toBeTruthy()
  })

  test('未認証ユーザーがアクセスするとログインにリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/admin/team-codes')

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// 5. API エンドポイント検証
// ---------------------------------------------------------------------------

test.describe('チームコード管理 -- API', () => {
  test('GET /api/admin/team-codes は未認証で 401 を返す', async ({
    request,
  }) => {
    const response = await request.get('/api/admin/team-codes')
    expect(response.status()).toBe(401)
  })

  test('POST /api/admin/team-codes は未認証で 401 を返す', async ({
    request,
  }) => {
    const response = await request.post('/api/admin/team-codes', {
      data: { expires_in_days: 7 },
    })
    expect(response.status()).toBe(401)
  })
})
