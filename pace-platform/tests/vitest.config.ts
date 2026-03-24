/**
 * tests/vitest.config.ts
 * ============================================================
 * Vitest 設定（ユニットテスト + セキュリティチェックリスト）
 *
 * 実行コマンド:
 *   npx vitest --config tests/vitest.config.ts
 *   npx vitest --config tests/vitest.config.ts --reporter=verbose
 *   npx vitest --config tests/vitest.config.ts run  # CI 用（ウォッチなし）
 * ============================================================
 */

import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    // テスト対象ファイル
    include: [
      'tests/unit/**/*.test.ts',
      'tests/security/**/*.test.ts',
    ],

    // グローバルセットアップ
    setupFiles: ['tests/setup.ts'],

    // グローバル設定
    globals: true,
    environment: 'node',

    // タイムアウト設定（AI API テストは長めに）
    testTimeout: 30_000,
    hookTimeout: 10_000,

    // カバレッジ設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**/*.ts'],
      exclude: [
        'lib/**/*.d.ts',
        'node_modules/**',
        'tests/**',
      ],
      // カバレッジ閾値（品質ゲート）
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },

    // テストレポーター
    reporter: ['verbose'],

    // 環境変数の読み込み（.env.test があれば使用）
    env: {
      NODE_ENV: 'test',
    },

    // モック設定
    clearMocks: true,
    restoreMocks: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '..'),
      '@lib': path.resolve(__dirname, '../lib'),
    },
  },
})
