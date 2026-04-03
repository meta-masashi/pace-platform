/**
 * vitest.config.ts (root)
 * ============================================================
 * Vitest 設定 — ルートレベル設定
 * pace-platform/tests/ 配下のユニット + セキュリティテストのみ実行
 * e2e テストは Playwright で実行するため除外
 * ============================================================
 */

import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    // テスト対象: pace-platform/tests/ 配下のみ
    include: [
      'pace-platform/tests/unit/**/*.test.ts',
      'pace-platform/tests/security/**/*.test.ts',
    ],

    // 除外パターン
    exclude: [
      '**/node_modules/**',
      '**/node_modules 2/**',
      'src/**',
      'pace-platform/tests/e2e/**',
    ],

    // グローバルセットアップ
    setupFiles: ['pace-platform/tests/setup.ts'],

    globals: true,
    environment: 'node',

    testTimeout: 30_000,
    hookTimeout: 10_000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['pace-platform/lib/**/*.ts'],
      exclude: [
        'pace-platform/lib/**/*.d.ts',
        '**/node_modules/**',
        '**/tests/**',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },

    reporters: ['verbose'],

    env: {
      NODE_ENV: 'test',
    },

    clearMocks: true,
    restoreMocks: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'pace-platform'),
      '@lib': path.resolve(__dirname, 'pace-platform/lib'),
    },
  },
})
