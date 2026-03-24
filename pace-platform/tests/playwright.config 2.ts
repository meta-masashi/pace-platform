/**
 * tests/playwright.config.ts
 * ============================================================
 * Playwright 設定（E2E テスト）
 *
 * 実行コマンド:
 *   npx playwright test --config tests/playwright.config.ts
 *   npx playwright test --config tests/playwright.config.ts --headed  # ブラウザ表示
 *   npx playwright test --config tests/playwright.config.ts --project=chromium  # Chrome のみ
 *
 * 環境変数（.env.test または CI で設定）:
 *   BASE_URL             - テスト対象 URL（デフォルト: http://localhost:3000）
 *   TEST_USER_EMAIL      - テストユーザーのメールアドレス
 *   TEST_USER_PASSWORD   - テストユーザーのパスワード
 *   TEST_STARTER_USER_EMAIL    - Starter プランのテストユーザー
 *   TEST_STARTER_USER_PASSWORD - Starter プランのテストユーザーパスワード
 * ============================================================
 */

import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  // テストディレクトリ
  testDir: path.resolve(__dirname, './e2e'),

  // テストファイルパターン
  testMatch: '**/*.spec.ts',

  // 全テストのタイムアウト
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },

  // 失敗時のリトライ（CI では 2 回、ローカルでは 0 回）
  retries: process.env.CI ? 2 : 0,

  // 並列実行設定
  fullyParallel: false, // 決済テストは順次実行
  workers: process.env.CI ? 1 : 2,

  // レポーター設定
  reporter: [
    ['html', { outputFolder: 'tests/playwright-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'tests/playwright-results.json' }],
  ],

  // グローバル設定
  use: {
    baseURL: BASE_URL,

    // スクリーンショット: 失敗時のみ
    screenshot: 'only-on-failure',

    // ビデオ: 失敗時のみ
    video: 'retain-on-failure',

    // トレース: 失敗時のみ
    trace: 'retain-on-failure',

    // タイムアウト
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    // ロケール（日本語）
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },

  // テストプロジェクト設定
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      // 決済テストはモバイルでも検証
      testMatch: '**/auth.spec.ts',
    },
  ],

  // テスト前にアプリを起動する場合（ローカル開発環境）
  // webServer: {
  //   command: 'npm run dev',
  //   url: BASE_URL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },

  // グローバルセットアップ・ティアダウン
  // globalSetup: './tests/e2e/global-setup.ts',
  // globalTeardown: './tests/e2e/global-teardown.ts',

  // テスト結果の出力ディレクトリ
  outputDir: 'tests/playwright-results',
})
